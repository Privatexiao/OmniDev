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
          <h3>📥 勾选要导入的项目与环境</h3>
          <button class="btn-close" @click="hide">✕</button>
        </div>
        <div class="modal-body import-preview-body">
          <p class="import-preview-desc">我们已解析您上传的配置包，请勾选您希望导入的部分。您可以在项目右侧为其指定本地工作目录（可选）：</p>
          
          <div class="import-projects-tree">
            <div v-for="proj in importProjectsList" :key="proj.id" class="import-proj-node">
              
              <!-- 项目级节点 -->
              <div class="proj-node-header">
                <label class="checkbox-label flex-align-center">
                  <input type="checkbox" v-model="proj.selected" @change="handleProjectSelectChange(proj)" />
                  <span class="proj-node-name">📂 {{ proj.name }}</span>
                </label>
                
                <div class="proj-path-input-group">
                  <span class="proj-path-label">工作目录:</span>
                  <input type="text" v-model="proj.path" placeholder="可选，例如 E:\projects\my-project" class="form-control mini-path-input" />
                </div>
              </div>
              
              <!-- 环境子列表 -->
              <div class="proj-node-envs-list">
                <div v-for="env in proj.envs" :key="env.key" class="env-node-item">
                  <label class="checkbox-label flex-align-center">
                    <input type="checkbox" v-model="env.selected" @change="handleEnvSelectChange(proj)" />
                    <span class="env-node-key">⚡ {{ env.key }}</span>
                    <span class="env-node-desc" v-if="env.companyName">({{ env.companyName }})</span>
                  </label>
                  <span class="env-node-host truncate-value" v-if="env.raw.VUE_DEV_HOST" :title="env.raw.VUE_DEV_HOST">{{ env.raw.VUE_DEV_HOST }}</span>
                </div>
              </div>
              
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-mini btn-mini-cancel" @click="hide">取消</button>
          <button class="btn-mini btn-mini-primary" :disabled="importing" @click="submitImportSelection">
            {{ importing ? '正在导入...' : '✅ 确认导入所选配置' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.import-preview-modal {
  width: 680px;
  max-width: 95vw;
  border-radius: 12px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(120, 120, 120, 0.1);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0;
  line-height: 1;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid rgba(120, 120, 120, 0.1);
  justify-content: flex-end;
}

.import-preview-body {
  padding: 16px 20px;
}

.import-preview-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 16px;
}

.import-projects-tree {
  max-height: 380px;
  overflow-y: auto;
  border: 1px solid rgba(120, 120, 120, 0.15);
  border-radius: 8px;
  background: rgba(120, 120, 120, 0.02);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 滚动条精细美化 */
.import-projects-tree::-webkit-scrollbar {
  width: 4px;
}
.import-projects-tree::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.15);
  border-radius: 4px;
}

.import-proj-node {
  border: 1px solid rgba(120, 120, 120, 0.1);
  border-radius: 8px;
  background: rgba(120, 120, 120, 0.02);
  padding: 10px 12px;
}

.proj-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(120, 120, 120, 0.1);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.proj-node-name {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--text);
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
  font-size: 11px;
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
  padding-left: 14px;
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
  font-family: monospace;
  color: var(--primary);
  max-width: 240px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.flex-align-center {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
}

.btn-mini {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.btn-mini-primary {
  background: var(--primary);
  color: #fff;
}
.btn-mini-primary:hover {
  opacity: 0.9;
}
.btn-mini-cancel {
  background: rgba(120, 120, 120, 0.08);
  border-color: rgba(120, 120, 120, 0.15);
  color: var(--text);
}
.btn-mini-cancel:hover {
  background: rgba(120, 120, 120, 0.16);
}
.btn-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.animate-zoom {
  animation: zoomIn 0.2s ease;
}
@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.form-control {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(120, 120, 120, 0.2);
  background: rgba(120, 120, 120, 0.05);
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.form-control:focus {
  border-color: var(--primary);
}
</style>
