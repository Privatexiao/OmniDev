<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  projectId: {
    type: String,
    default: ''
  },
  projectName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['updated', 'message'])

const visible = ref(false)
const searchQuery = ref('')
const showAllPasswords = ref(false)
const showExtendedFields = ref(false)
const saving = ref(false)

// 数据结构列表
const rows = ref([])

const triggerMessage = (text, type = 'info') => {
  emit('message', { text, type })
}

// 检查某一行是否发生了变动
const isRowChanged = (row) => {
  if (!row._original) return false
  const fields = ['local_port', 'online_username', 'online_password', 'login_url', 'VUE_DEV_HOST']
  return fields.some(key => String(row[key] ?? '') !== String(row._original[key] ?? ''))
}

// 重置某一行
const revertRow = (row) => {
  if (!row._original) return
  row.local_port = row._original.local_port
  row.online_username = row._original.online_username
  row.online_password = row._original.online_password
  row.login_url = row._original.login_url
  row.VUE_DEV_HOST = row._original.VUE_DEV_HOST
}

// 搜索过滤后的行
const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter(r => 
    r.envKey.toLowerCase().includes(query) ||
    String(r.online_username || '').toLowerCase().includes(query) ||
    String(r.local_port || '').includes(query)
  )
})

// 发生变更的环境总数
const changedCount = computed(() => {
  return rows.value.filter(r => isRowChanged(r)).length
})

// 打开弹窗，深拷贝传入的环境配置
const show = (envsData = {}) => {
  showAllPasswords.value = false
  searchQuery.value = ''
  
  const list = []
  for (const [key, conf] of Object.entries(envsData)) {
    if (!conf) continue
    const item = {
      envKey: key,
      local_port: conf.local_port !== undefined && conf.local_port !== null ? String(conf.local_port) : '',
      online_username: conf.online_username || '',
      online_password: conf.online_password || '',
      login_url: conf.login_url || '',
      VUE_DEV_HOST: conf.VUE_DEV_HOST || '',
      showPassword: false,
      _original: {
        local_port: conf.local_port !== undefined && conf.local_port !== null ? String(conf.local_port) : '',
        online_username: conf.online_username || '',
        online_password: conf.online_password || '',
        login_url: conf.login_url || '',
        VUE_DEV_HOST: conf.VUE_DEV_HOST || ''
      }
    }
    list.push(item)
  }
  rows.value = list
  visible.value = true
}

const hide = () => {
  visible.value = false
}

// 重置所有更改
const revertAll = () => {
  rows.value.forEach(revertRow)
}

// 提交批量更新
const handleSave = async () => {
  const changedRows = rows.value.filter(r => isRowChanged(r))
  if (changedRows.length === 0) {
    triggerMessage('未检测到任何需要保存的更改', 'info')
    return
  }

  // 端口合法性简单校验
  for (const row of changedRows) {
    if (row.local_port) {
      const portNum = parseInt(row.local_port, 10)
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        triggerMessage(`环境 [${row.envKey}] 的端口号格式不合法 (有效范围 1-65535)`, 'error')
        return
      }
    }
  }

  saving.value = true
  try {
    const updates = changedRows.map(row => {
      const fields = {}
      if (String(row.local_port ?? '') !== String(row._original.local_port ?? '')) {
        fields.local_port = row.local_port ? parseInt(row.local_port, 10) : ''
      }
      if (String(row.online_username ?? '') !== String(row._original.online_username ?? '')) {
        fields.online_username = row.online_username
      }
      if (String(row.online_password ?? '') !== String(row._original.online_password ?? '')) {
        fields.online_password = row.online_password
      }
      if (String(row.login_url ?? '') !== String(row._original.login_url ?? '')) {
        fields.login_url = row.login_url
      }
      if (String(row.VUE_DEV_HOST ?? '') !== String(row._original.VUE_DEV_HOST ?? '')) {
        fields.VUE_DEV_HOST = row.VUE_DEV_HOST
      }
      return {
        envKey: row.envKey,
        fields
      }
    })

    const res = await fetch('/api/envs/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: props.projectId,
        updates
      })
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || '批量保存失败')
    }

    triggerMessage(data.message || `成功保存 ${changedRows.length} 组环境配置变更！`, 'success')
    emit('updated')
    hide()
  } catch (err) {
    triggerMessage(err.message, 'error')
  } finally {
    saving.value = false
  }
}

watch(visible, (isOpen) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
})

defineExpose({
  show,
  hide
})
</script>

<template>
  <Teleport to="body">
    <div class="batch-modal-overlay" v-if="visible" @click.self="hide">
      <div class="glass-card batch-modal-container animate-zoom">
        <!-- 弹窗表头 -->
        <div class="modal-header">
          <div class="header-titles">
            <div class="main-title">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 3.5h12M2 8h12M2 12.5h12M5 1.5v4M11 6v4M7 10.5v4"/></svg>
              <h3>环境集中配置工作台</h3>
              <span class="project-tag" v-if="projectName">{{ projectName }}</span>
            </div>
            <p class="subtitle">集中调整当前项目各环境的本地端口、登录账号与密码，支持全键盘 Tab 连续录入</p>
          </div>
          <button class="btn-close press-spring" @click="hide" title="关闭" aria-label="关闭">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <!-- 顶部工具栏 -->
        <div class="modal-toolbar">
          <div class="toolbar-left">
            <div class="search-input-box">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
              <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="搜索环境、端口或账号..."
                class="search-input"
              />
              <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
            </div>

            <button 
              class="toolbar-pill-btn" 
              :class="{ active: showAllPasswords }"
              @click="showAllPasswords = !showAllPasswords"
              title="全局切换明文或密文显示"
            >
              <svg v-if="showAllPasswords" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/></svg>
              <svg v-else viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l12 12M6.5 6.5a2.5 2.5 0 0 0 3.5 3.5M1.5 8s2.5-4.5 6.5-4.5c1.4 0 2.6.5 3.6 1.3M14.5 8s-2.5 4.5-6.5 4.5c-1.8 0-3.3-.8-4.5-2"/></svg>
              <span>{{ showAllPasswords ? '隐藏所有密码' : '显示全部明文' }}</span>
            </button>
          </div>

          <div class="toolbar-right">
            <button 
              class="toolbar-pill-btn" 
              :class="{ active: showExtendedFields }"
              @click="showExtendedFields = !showExtendedFields"
              title="展开直达登录链接与代理源配置"
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 5h10M3 8h10M3 11h6"/></svg>
              <span>{{ showExtendedFields ? '收起扩展字段' : '展开更多字段' }}</span>
            </button>
          </div>
        </div>

        <!-- 集中录入表格区 -->
        <div class="modal-table-body">
          <table class="batch-edit-table" v-if="filteredRows.length > 0">
            <thead>
              <tr>
                <th style="width: 130px;">环境名称</th>
                <th style="width: 120px;">本地端口</th>
                <th style="width: 160px;">登录账号</th>
                <th style="min-width: 200px;">登录密码 (Tab快速流)</th>
                <th v-if="showExtendedFields" style="width: 200px;">登录直达地址</th>
                <th v-if="showExtendedFields" style="width: 200px;">前端代理源</th>
                <th style="width: 80px; text-align: center;">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="row in filteredRows" 
                :key="row.envKey"
                class="batch-table-row"
                :class="{ 'row-modified': isRowChanged(row) }"
              >
                <!-- 1. 环境名 -->
                <td class="cell-env-name">
                  <span class="env-pill-tag">{{ row.envKey }}</span>
                </td>

                <!-- 2. 本地端口 -->
                <td class="cell-input">
                  <input 
                    type="number" 
                    v-model="row.local_port" 
                    placeholder="如 8080"
                    class="in-table-input port-input"
                  />
                </td>

                <!-- 3. 登录账号 -->
                <td class="cell-input">
                  <input 
                    type="text" 
                    v-model="row.online_username" 
                    placeholder="登录用户名"
                    class="in-table-input"
                  />
                </td>

                <!-- 4. 登录密码 -->
                <td class="cell-input cell-password">
                  <div class="in-table-password-wrap">
                    <input 
                      :type="showAllPasswords || row.showPassword ? 'text' : 'password'" 
                      v-model="row.online_password" 
                      placeholder="输入新密码"
                      class="in-table-input"
                    />
                    <button 
                      type="button" 
                      class="btn-eye-in-table"
                      @click="row.showPassword = !row.showPassword"
                      :title="row.showPassword ? '密文隐藏' : '明文显示'"
                    >
                      <svg v-if="showAllPasswords || row.showPassword" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/></svg>
                      <svg v-else viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l12 12M6.5 6.5a2.5 2.5 0 0 0 3.5 3.5M1.5 8s2.5-4.5 6.5-4.5c1.4 0 2.6.5 3.6 1.3M14.5 8s-2.5 4.5-6.5 4.5c-1.8 0-3.3-.8-4.5-2"/></svg>
                    </button>
                  </div>
                </td>

                <!-- 扩展列：登录地址 -->
                <td v-if="showExtendedFields" class="cell-input">
                  <input 
                    type="text" 
                    v-model="row.login_url" 
                    placeholder="https://..."
                    class="in-table-input"
                  />
                </td>

                <!-- 扩展列：代理源 -->
                <td v-if="showExtendedFields" class="cell-input">
                  <input 
                    type="text" 
                    v-model="row.VUE_DEV_HOST" 
                    placeholder="https://..."
                    class="in-table-input"
                  />
                </td>

                <!-- 变动状态指示 -->
                <td class="cell-status">
                  <div class="status-cell-wrap" v-if="isRowChanged(row)">
                    <span class="changed-badge">已修改</span>
                    <button class="btn-revert" @click="revertRow(row)" title="恢复原配置">
                      <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.2-3.4M2.5 3v2.5H5"/></svg>
                    </button>
                  </div>
                  <span class="unchanged-text" v-else>未变动</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="table-empty-hint" v-else>
            <p>未找到匹配的环境项</p>
          </div>
        </div>

        <!-- 底部 Footer -->
        <div class="modal-footer">
          <div class="footer-left">
            <span class="changes-stat" :class="{ 'has-changes': changedCount > 0 }">
              <span class="stat-dot"></span>
              <span>{{ changedCount > 0 ? `已检测到 ${changedCount} 组环境配置变动` : '尚未进行任何配置修改' }}</span>
            </span>
          </div>

          <div class="footer-right">
            <button 
              class="btn-secondary" 
              @click="revertAll" 
              :disabled="changedCount === 0 || saving"
              v-if="changedCount > 0"
            >
              重置全部
            </button>
            <button class="btn-secondary" @click="hide" :disabled="saving">
              取消
            </button>
            <button 
              class="btn-primary" 
              @click="handleSave" 
              :disabled="changedCount === 0 || saving"
            >
              <svg v-if="saving" class="spin-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="10"/></svg>
              <span>{{ saving ? '保存同步中...' : '保存所有更改' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.batch-modal-container {
  width: 920px;
  max-width: 94vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg, #ffffff);
  border-radius: var(--radius-card, 20px);
  border: var(--border);
  box-shadow: 0 16px 48px -8px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  box-sizing: border-box;
}

[data-theme="dark"] .batch-modal-container {
  background: #1c1d24;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 24px 14px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.main-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}

.main-title h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: var(--tracking-title, -0.022em);
}

.project-tag {
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
  border: 1px solid rgba(0, 102, 204, 0.2);
  padding: 1px 8px;
  border-radius: var(--radius-pill, 980px);
  font-size: 11px;
  font-weight: 600;
}

[data-theme="dark"] .project-tag {
  background: rgba(41, 151, 255, 0.12);
  color: #2997ff;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.btn-close {
  background: rgba(0, 0, 0, 0.04);
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .btn-close {
  background: rgba(255, 255, 255, 0.06);
}

.btn-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
  transform: scale(1.06);
}

[data-theme="dark"] .btn-close:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* 工具栏 */
.modal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  gap: 12px;
}

[data-theme="dark"] .modal-toolbar {
  background: rgba(255, 255, 255, 0.02);
  border-bottom-color: rgba(255, 255, 255, 0.04);
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input-box {
  display: inline-flex;
  align-items: center;
  background: var(--panel-bg, #ffffff);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--radius-pill, 980px);
  padding: 0 10px;
  height: 28px;
  color: var(--text-secondary);
}

[data-theme="dark"] .search-input-box {
  background: #24252c;
  border-color: rgba(255, 255, 255, 0.08);
}

.search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 12px;
  color: var(--text);
  padding: 0 6px;
  width: 160px;
}

.clear-search-btn {
  background: transparent;
  border: none;
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
}

.toolbar-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--radius-pill, 980px);
  padding: 3px 10px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .toolbar-pill-btn {
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.toolbar-pill-btn:hover {
  background: var(--surface, #ffffff);
  color: var(--text);
}

.toolbar-pill-btn.active {
  background: rgba(0, 102, 204, 0.08);
  border-color: rgba(0, 102, 204, 0.25);
  color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .toolbar-pill-btn.active {
  background: rgba(41, 151, 255, 0.15);
  color: #2997ff;
}

/* 表格主体 */
.modal-table-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  padding: 8px 24px;
}

.batch-edit-table {
  width: 100%;
  border-collapse: collapse;
}

.batch-edit-table th {
  padding: 10px 8px;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps, 0.045em);
  text-align: left;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .batch-edit-table th {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.batch-table-row td {
  padding: 8px 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.035);
  vertical-align: middle;
}

[data-theme="dark"] .batch-table-row td {
  border-bottom-color: rgba(255, 255, 255, 0.035);
}

.batch-table-row.row-modified {
  background: rgba(0, 102, 204, 0.025);
}

[data-theme="dark"] .batch-table-row.row-modified {
  background: rgba(41, 151, 255, 0.04);
}

.env-pill-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 650;
  color: var(--text);
  background: rgba(0, 0, 0, 0.04);
  padding: 3px 9px;
  border-radius: var(--radius-pill, 980px);
}

[data-theme="dark"] .env-pill-tag {
  background: rgba(255, 255, 255, 0.06);
}

/* 表格内输入框 */
.in-table-input {
  width: 100%;
  height: 28px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--text);
  outline: none;
  box-sizing: border-box;
  transition: all 0.18s ease;
}

[data-theme="dark"] .in-table-input {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.07);
}

.in-table-input:focus {
  background: var(--panel-bg, #ffffff);
  border-color: var(--color-brand, #0066cc);
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.15);
}

[data-theme="dark"] .in-table-input:focus {
  background: #202128;
  border-color: #2997ff;
  box-shadow: 0 0 0 2px rgba(41, 151, 255, 0.2);
}

.port-input {
  text-align: center;
}

.in-table-password-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.in-table-password-wrap .in-table-input {
  padding-right: 26px;
}

.btn-eye-in-table {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.btn-eye-in-table:hover {
  color: var(--text);
}

.status-cell-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.changed-badge {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-brand, #0066cc);
  background: rgba(0, 102, 204, 0.08);
  padding: 2px 6px;
  border-radius: var(--radius-pill, 980px);
}

[data-theme="dark"] .changed-badge {
  color: #2997ff;
  background: rgba(41, 151, 255, 0.15);
}

.unchanged-text {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.6;
}

.btn-revert {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  transition: transform 0.15s ease, color 0.15s ease;
}

.btn-revert:hover {
  color: var(--color-danger, #ff3b30);
  transform: rotate(-45deg);
}

.table-empty-hint {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 13px;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(0, 0, 0, 0.015);
}

[data-theme="dark"] .modal-footer {
  border-top-color: rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.015);
}

.changes-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.changes-stat.has-changes {
  color: var(--color-brand, #0066cc);
  font-weight: 550;
}

[data-theme="dark"] .changes-stat.has-changes {
  color: #2997ff;
}

.stat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-secondary {
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-pill, 980px);
  padding: 5px 14px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
  transition: all 0.18s ease;
}

[data-theme="dark"] .btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
}

.btn-secondary:active:not(:disabled) {
  transform: scale(0.975);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-brand, #0066cc);
  border: none;
  border-radius: var(--radius-pill, 980px);
  padding: 6px 18px;
  font-size: 12.5px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 102, 204, 0.3);
  transition: all 0.18s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-brand-hover, #0077ed);
  box-shadow: 0 2px 6px rgba(0, 102, 204, 0.4);
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.975);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
