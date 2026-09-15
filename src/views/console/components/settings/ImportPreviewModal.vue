<script setup>
/**
 * @file ImportPreviewModal.vue
 * @description 导入配置的预览合并弹窗组件，用于解析所上传的 JSON 备份包并在树形结构中自由勾选、重定义本地工作目录后执行导入
 */
import { ref } from 'vue'

const props = defineProps({
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['success', 'message'])

const visible = ref(false)
const importing = ref(false)
const importProjectsList = ref([])
const rawConfigData = ref(null)

const show = (configData) => {
  if (!configData) return
  rawConfigData.value = configData
  const list = []
  
  if (configData.projectsData) {
    // 全量大包格式
    const backupProjects = configData.projects || []
    const backupProjectsData = configData.projectsData || {}
    
    backupProjects.forEach(proj => {
      if (!proj.id) return
      const pData = backupProjectsData[proj.id] || {}
      
      // 提取环境
      const envs = Object.entries(pData.envs || {}).map(([key, val]) => {
        // 兼容 credentials 的提取格式
        const rawCreds = Array.isArray(val.credentials) ? val.credentials : []
        return {
          key,
          companyName: val.company_name || '',
          selected: true,
          raw: val
        }
      })
      
      list.push({
        id: proj.id,
        name: proj.name,
        path: proj.path || '',
        ssh: pData.ssh || {},
        envs,
        selected: true,
        isSingle: false
      })
    })
  } else if (configData.envs) {
    // 兼容旧版单项目格式
    const projName = configData._sourceName || '新导入项目'
    const cleanId = projName.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_').replace(/_+/g, '_') || 'imported_project'
    
    const envs = Object.entries(configData.envs || {}).map(([key, val]) => ({
      key,
      companyName: val.company_name || '',
      selected: true,
      raw: val
    }))
    
    list.push({
      id: cleanId,
      name: projName,
      path: '',
      ssh: {},
      envs,
      selected: true,
      isSingle: true
    })
  }
  
  importProjectsList.value = list
  visible.value = true
}

const hide = () => {
  visible.value = false
  importProjectsList.value = []
  rawConfigData.value = null
}

const handleOverlayClick = () => {
  if (props.closeOnOverlayClick) {
    hide()
  }
}

const handleProjectSelectChange = (proj) => {
  proj.envs.forEach(env => {
    env.selected = proj.selected
  })
}

const handleEnvSelectChange = (proj) => {
  const anyChecked = proj.envs.some(env => env.selected)
  proj.selected = anyChecked
}

const submitImportSelection = async () => {
  const activeProjects = importProjectsList.value.filter(p => p.selected)
  if (activeProjects.length === 0) {
    emit('message', { text: '请至少勾选一个要导入的项目及环境', type: 'warning' })
    return
  }
  
  const totalEnvsChecked = activeProjects.reduce((acc, p) => acc + p.envs.filter(e => e.selected).length, 0)
  if (totalEnvsChecked === 0) {
    emit('message', { text: '请至少勾选一个环境进行导入', type: 'warning' })
    return
  }
  
  importing.value = true
  try {
    const isSingleProjectImport = activeProjects.length === 1 && activeProjects[0].isSingle
    let submitPayload = {}
    
    if (isSingleProjectImport) {
      const proj = activeProjects[0]
      const selectedEnvs = {}
      proj.envs.forEach(env => {
        if (env.selected) {
          selectedEnvs[env.key] = env.raw
        }
      })
      submitPayload = {
        configData: {
          version: '1.0.0',
          _sourceName: proj.name,
          envs: selectedEnvs
        },
        projectName: proj.name,
        projectPath: proj.path.trim()
      }
    } else {
      const subProjects = []
      const subProjectsData = {}
      
      activeProjects.forEach(proj => {
        subProjects.push({
          id: proj.id,
          name: proj.name,
          path: proj.path.trim()
        })
        
        const selectedEnvs = {}
        proj.envs.forEach(env => {
          if (env.selected) {
            selectedEnvs[env.key] = env.raw
          }
        })
        
        subProjectsData[proj.id] = {
          envs: selectedEnvs,
          ssh: proj.ssh || {}
        }
      })
      
      submitPayload = {
        configData: {
          version: '1.1.0',
          exportedAt: new Date().toISOString(),
          appConfig: rawConfigData.value?.appConfig,
          activeProjectId: rawConfigData.value?.activeProjectId,
          projects: subProjects,
          projectsData: subProjectsData
        }
      }
    }

    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitPayload)
    })
    const data = await res.json()
    if (res.ok) {
      emit('success', data)
      hide()
    } else {
      emit('message', { text: data.error || '导入失败', type: 'danger' })
    }
  } catch (err) {
    emit('message', { text: '导入失败: ' + err.message, type: 'danger' })
  } finally {
    importing.value = false
  }
}

defineExpose({ show, hide, visible })
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" v-if="visible" @click.self="handleOverlayClick">
      <div class="glass-card modal-content import-preview-modal animate-zoom">
        <div class="modal-header">
          <div class="header-left">
            <div class="header-icon-box brand">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </div>
            <div class="header-title-wrap">
              <h3 class="modal-title">导入配置预览与确认</h3>
              <p class="modal-desc">解析备份包成功，请勾选需导入的项目及各环境节点</p>
            </div>
          </div>
          <button class="btn-close press-spring" @click="hide" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-body import-preview-body">
          <div class="callout-card">
            <svg class="callout-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div class="callout-text">
              勾选目标项目与其下属环境，可在右侧设定或校对本地物理工作目录。已有同名环境将被安全合并。
            </div>
          </div>
          
          <div class="import-projects-tree">
            <div v-for="proj in importProjectsList" :key="proj.id" class="import-proj-node">
              <!-- 项目级节点 -->
              <div class="proj-node-header">
                <label class="form-checkbox-label">
                  <input type="checkbox" v-model="proj.selected" class="form-checkbox" @change="handleProjectSelectChange(proj)" />
                  <span class="checkbox-box mini">
                    <svg class="check-icon" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </span>
                  <div class="proj-title-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="proj-folder-icon">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span class="proj-node-name">{{ proj.name }}</span>
                  </div>
                </label>
                
                <div class="proj-path-input-group">
                  <span class="proj-path-label">工作目录:</span>
                  <input type="text" v-model="proj.path" placeholder="可选，指定该项目本地物理绝对路径" class="form-control mini-path-input" />
                </div>
              </div>
              
              <!-- 环境子列表 -->
              <div class="proj-node-envs-list">
                <div v-for="env in proj.envs" :key="env.key" class="env-node-item">
                  <label class="form-checkbox-label">
                    <input type="checkbox" v-model="env.selected" class="form-checkbox" @change="handleEnvSelectChange(proj)" />
                    <span class="checkbox-box mini">
                      <svg class="check-icon" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                    <span class="env-node-key">{{ env.key }}</span>
                    <span class="env-node-desc" v-if="env.companyName">({{ env.companyName }})</span>
                  </label>
                  <span class="env-node-host truncate-value" v-if="env.raw.VUE_DEV_HOST" :title="env.raw.VUE_DEV_HOST">{{ env.raw.VUE_DEV_HOST }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-pill-secondary press-spring" @click="hide" :disabled="importing">取消</button>
          <button class="btn-pill-primary press-spring" :disabled="importing" @click="submitImportSelection">
            <svg v-if="importing" class="spinner-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
            <span>{{ importing ? '正在导入配置...' : '确认导入所选' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.import-preview-modal {
  max-width: 680px !important;
  width: 94vw;
  border-radius: var(--radius-card, 20px);
}

.import-preview-body {
  padding: 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-projects-tree {
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.015);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

[data-theme="dark"] .import-projects-tree {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.06);
}

.import-proj-node {
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  background: var(--panel-bg, #ffffff);
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .import-proj-node {
  background: #1f2027;
  border-color: rgba(255, 255, 255, 0.06);
}

.proj-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

[data-theme="dark"] .proj-node-header {
  border-bottom-color: rgba(255, 255, 255, 0.05);
}

.proj-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.proj-folder-icon {
  color: var(--color-brand, #0066cc);
  flex-shrink: 0;
}

[data-theme="dark"] .proj-folder-icon {
  color: #2997ff;
}

.proj-node-name {
  font-weight: 650;
  font-size: 13px;
  color: var(--text);
  letter-spacing: -0.01em;
}

.proj-path-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
  justify-content: flex-end;
}

.proj-path-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.mini-path-input {
  font-size: 11.5px !important;
  padding: 4px 8px !important;
  width: 220px;
  flex-shrink: 0;
}

.proj-node-envs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 24px;
}

.env-node-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
}

.env-node-key {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.env-node-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 4px;
}

.env-node-host {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--color-brand, #0066cc);
  max-width: 240px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

[data-theme="dark"] .env-node-host {
  color: #2997ff;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
