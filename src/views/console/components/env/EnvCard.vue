<script setup>
/**
 * @file EnvCard.vue
 * @description 单个项目环境在列表中所对应的表格行组件，提供服务启停、一键免密登录、远程分支获取/切换及环境配置修改等核心交互行为
 */
import { ref, onMounted, watch, computed } from 'vue'
import BranchSwitchModal from '../project/BranchSwitchModal.vue'
import { copyToClipboard } from '../../../../utils/platform'

// 声明 Props 验证
const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  config: {
    type: Object,
    default: () => ({})
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  port: {
    type: [Number, String],
    default: null
  },
  currentEnv: {
    type: String,
    default: ''
  }
})

// 声明计算属性
const displayName = computed(() => props.name)
const hasLoginCredential = computed(() => {
  const creds = props.config.credentials || []
  if (Array.isArray(creds)) {
    return creds.length > 0
  }
  return Object.keys(creds).length > 0
})
const credentialFields = computed(() => {
  const creds = props.config.credentials || {}
  if (Array.isArray(creds)) {
    return creds.filter(item => item && item.key)
  }
  return Object.entries(creds).map(([key, value]) => ({
    key,
    value,
    inject_type: 'cookie'
  }))
})
const credentialTypesText = computed(() => {
  const types = new Set(credentialFields.value.map(item => item.inject_type || 'cookie'))
  return Array.from(types).join(' / ')
})
const isCredentialsComplete = computed(() => {
  const creds = props.config.credentials || []
  if (Array.isArray(creds)) {
    const activeCreds = creds.filter(item => item && item.key && item.enabled !== false)
    return !activeCreds.some(item => !String(item.value || '').trim())
  }
  const values = Object.values(creds)
  if (values.length === 0) return true
  return values.every(val => !!String(val || '').trim())
})
const launchDisabledReason = computed(() => {
  if (!props.config.VUE_DEV_HOST) return '请先填写页面代理源域名'
  if (!hasLoginCredential.value) return '请先填写登录凭证'
  if (!isCredentialsComplete.value) return '请先填齐所有已启用的免密登录凭证字段的值'
  return ''
})
const canLaunch = computed(() => !launchDisabledReason.value)

const canLaunchOnline = computed(() => {
  return !!(props.config.login_url && props.config.online_username && props.config.online_password)
})
const launchOnlineDisabledReason = computed(() => {
  if (!props.config.login_url || !props.config.online_username || !props.config.online_password) {
    return '请先在一键登录配置中填写完整的登录直达链接、线上登录账号与密码'
  }
  return ''
})
const branchDisabledReason = computed(() => {
  if (props.config.disable_branch) return '当前环境已禁用远程分支操作'
  if (!props.config.remote_dir) return '请先填写远程物理部署目录名'
  return ''
})
const canUseBranch = computed(() => !branchDisabledReason.value)

// 声明事件分发
const emit = defineEmits(['startEnv', 'stopEnv', 'launchEnv', 'launchLocalEnv', 'message', 'editEnv', 'deleteEnv', 'showDetail'])

// 辅助方法：分发消息提示
const triggerMessage = (text, type = 'info') => {
  emit('message', { text, type })
}

// 一键复制辅助小方法
const copyText = async (text) => {
  if (!text) return
  const ok = await copyToClipboard(text)
  triggerMessage(ok ? '已成功复制至剪贴板' : '复制失败，请重试', ok ? 'success' : 'error')
}

// 远程分支核心状态管理 & 弹出组件 Ref & 复制成功状态反馈
const branchModalRef = ref(null)
const currentBranch = ref('读取中...')
const loadingBranch = ref(false)
const switching = ref(false)
const copied = ref(false)
const copiedUrl = ref(false)
const copiedCompany = ref(false)

// 🚀 点击后端代理域名一键复制，并提供 1.2s 视觉反馈
const handleCopyUrl = async (e) => {
  e.preventDefault()
  if (!props.config.VUE_DEV_HOST) return
  if (await copyToClipboard(props.config.VUE_DEV_HOST)) {
    copiedUrl.value = true
    setTimeout(() => {
      copiedUrl.value = false
    }, 1200)
  }
}

// 🚀 点击企业名称一键复制，并提供 1.2s 视觉反馈
const handleCopyCompany = async () => {
  if (!props.config.company_name) return
  if (await copyToClipboard(props.config.company_name)) {
    copiedCompany.value = true
    setTimeout(() => {
      copiedCompany.value = false
    }, 1200)
  }
}

// 🚀 点击分支名进行智能剪贴板复制，并提供 1.5s 的动效提示
const handleCopyBranch = async () => {
  if (currentBranch.value === '读取中...' || currentBranch.value === '连接失败' || currentBranch.value === '获取失败' || currentBranch.value === '未配置') {
    return
  }
  if (await copyToClipboard(currentBranch.value)) {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  }
}

// 🚀 从后端异步获取服务器上该环境部署的当前分支名称
const loadBranchInfo = async () => {
  // 🔒 安全策略：针对设置了 disable_branch: true 的特权环境，直接拦截与服务器的 SSH 交互
  if (props.config.disable_branch) {
    currentBranch.value = '分支逻辑已禁用'
    return
  }
  if (!props.config.remote_dir) {
    currentBranch.value = '未配置'
    return
  }
  loadingBranch.value = true
  currentBranch.value = '读取中...'
  try {
    const res = await fetch(`/api/ssh/branches?env=${props.name}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      currentBranch.value = data.currentBranch || '未知'
    } else {
      currentBranch.value = data.error || '获取失败'
    }
  } catch (err) {
    currentBranch.value = '连接失败'
  } finally {
    loadingBranch.value = false
  }
}

// 🚀 弹出自定义精美对话框输入目标分支，并一键物理强切
const promptSwitchBranch = async () => {
  if (!canUseBranch.value) {
    triggerMessage(branchDisabledReason.value, 'warning')
    return
  }
  if (!branchModalRef.value) return
  
  const defaultVal = (currentBranch.value === '读取中...' || currentBranch.value === '连接失败' || currentBranch.value === '获取失败') ? '' : currentBranch.value
  
  // 使用高颜值模态框获取目标分支名，完美实现 await 阻断同步书写
  const branchName = await branchModalRef.value.show({
    title: `切换远程环境 [${displayName.value}] 分支`,
    defaultValue: defaultVal,
    placeholder: '输入目标分支名 (例如: main 或 dev)'
  })
  
  if (branchName === null) return // 点击取消
  
  const cleanBranch = branchName.trim()
  if (!cleanBranch) {
    triggerMessage('目标分支名称不能为空！', 'warning')
    return
  }
  
  const previousBranch = currentBranch.value
  switching.value = true
  currentBranch.value = `切换中...`
  
  try {
    const res = await fetch('/api/ssh/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: props.name, branch: cleanBranch })
    })
    
    if (res.ok) {
      currentBranch.value = cleanBranch
      triggerMessage(`远程环境 [${displayName.value}] 已成功重置、清理并切换为分支: ${cleanBranch}`, 'success')
    } else {
      const errData = await res.json()
      triggerMessage(`切换分支失败: ${errData.error}`, 'error')
      currentBranch.value = previousBranch
    }
  } catch (err) {
    triggerMessage(`连接服务器失败: ${err.message}`, 'error')
    currentBranch.value = previousBranch
  } finally {
    switching.value = false
  }
}

const handleStart = () => {
  emit('startEnv')
}

const handleStop = () => {
  emit('stopEnv')
}

const handleLaunch = (type = 'online') => {
  if (type === 'local') {
    if (!canLaunch.value) {
      triggerMessage(launchDisabledReason.value, 'warning')
      return
    }
    emit('launchLocalEnv')
  } else {
    if (!canLaunchOnline.value) {
      triggerMessage(launchOnlineDisabledReason.value, 'warning')
      return
    }
    emit('launchEnv')
  }
}

// 监听项目切换，自动重载分支信息
watch(() => props.config, () => {
  loadBranchInfo()
})

onMounted(() => {
  loadBranchInfo()
})
</script>

<template>
  <tr class="env-row" :class="{ 'row-running': isRunning, 'row-active-env': currentEnv === displayName }">
    <!-- 1. 状态指示器 -->
    <td class="col-status">
      <span class="status-dot" :class="{ active: isRunning }"></span>
    </td>
    
    <!-- 2. 环境名 -->
    <td class="col-name">
      <div class="name-cell-group">
        <span class="env-name-text">{{ displayName }}</span>
      </div>
    </td>


    <!-- 4. 本地端口 -->
    <td class="col-port">
      <span class="port-badge" v-if="isRunning && port">
        <span class="badge-dot"></span>
        {{ port }}
      </span>
      <span class="port-badge offline" v-else-if="config.local_port">
        <span class="badge-dot"></span>
        {{ config.local_port }}
      </span>
      <span class="text-muted" v-else>-</span>
    </td>

    <!-- 5. Git 远程分支 -->
    <td class="col-branch">
      <div class="branch-cell-wrapper" v-if="!config.disable_branch">
        <div class="branch-actions-row">
          <span 
            class="clickable-branch" 
            :class="{ 'branch-loading': loadingBranch || switching, 'copied': copied }"
            @click="handleCopyBranch"
            :title="copied ? '已成功复制到剪贴板！' : '点击复制分支全名'"
          >
            {{ copied ? '✅ 已复制！' : currentBranch }}
          </span>
          <span class="branch-icon-buttons">
            <button 
              class="btn-icon-action" 
              @click="loadBranchInfo" 
              :disabled="loadingBranch || switching || !canUseBranch" 
              :title="canUseBranch ? '刷新远程分支状态' : branchDisabledReason"
            >
              🔄
            </button>
            <button 
              class="btn-icon-action" 
              @click="promptSwitchBranch" 
              :disabled="switching || loadingBranch || !canUseBranch"
              :title="canUseBranch ? '切远程分支' : branchDisabledReason"
            >
              🔀
            </button>
          </span>
        </div>
      </div>
      <span class="text-muted" v-else>分支已禁用</span>
    </td>



    <!-- 8. 统一操作栏 -->
    <td class="col-actions">
      <div class="row-actions-wrapper">
        <button 
          v-if="isRunning" 
          class="btn btn-danger btn-sm" 
          @click="handleStop"
          title="⏹️ 停止开发服务"
        >
          ⏹️
        </button>
        <button 
          v-else 
          class="btn btn-primary btn-sm" 
          :class="{ 'btn-disabled': config.disable_start }"
          :disabled="config.disable_start"
          @click="handleStart"
          :title="config.disable_start ? '当前环境已禁用本地开发服务启动' : '▶️ 启动开发服务'"
        >
          ▶️
        </button>
        
        <button 
          class="btn btn-secondary btn-sm" 
          :class="{ 'btn-disabled': !canLaunchOnline }"
          :disabled="!canLaunchOnline"
          @click="handleLaunch('online')"
          :title="canLaunchOnline ? '🌐 登录线上环境' : launchOnlineDisabledReason"
        >
          🌐
        </button>
        
        <button 
          v-if="isRunning && port && hasLoginCredential"
          class="btn btn-success btn-sm" 
          :class="{ 'btn-disabled': !canLaunch }"
          :disabled="!canLaunch"
          @click="handleLaunch('local')"
          :title="canLaunch ? '💻 登录本地端口' : launchDisabledReason"
        >
          💻
        </button>

        <span class="actions-divider"></span>

        <span class="action-btn edit-env-btn" @click.stop="emit('editEnv', name, config)" title="编辑环境配置">✏️</span>
        <span class="action-btn delete-env-btn" @click.stop="emit('deleteEnv', name)" title="删除环境配置">🗑️</span>
        <span class="action-btn detail-env-btn" @click.stop="emit('showDetail', name, config)" title="查看数据详情">👁️</span>
      </div>

      <!-- 统一高颜值中央分支输入模态框 (放置于TD内部保障HTML完美渲染) -->
      <BranchSwitchModal ref="branchModalRef" />
    </td>
  </tr>
</template>

<style scoped>
/* 🚋 表格行样式 */
.env-row {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .env-row {
  border-bottom-color: rgba(255, 255, 255, 0.05);
}

/* 正在运行的环境背景 */
.env-row.row-running {
  background: rgba(16, 185, 129, 0.02);
}

[data-theme="dark"] .env-row.row-running {
  background: rgba(16, 185, 129, 0.04);
}

.env-row:hover,
.env-row.row-running:hover {
  background: rgba(99, 102, 241, 0.04);
}

[data-theme="dark"] .env-row:hover,
[data-theme="dark"] .env-row.row-running:hover {
  background: rgba(129, 140, 248, 0.08);
}

/* 当前处于激活编辑/日志回显的环境高亮 */
.env-row.row-active-env {
  border-left: 3px solid #6366f1;
}

[data-theme="dark"] .env-row.row-active-env {
  border-left-color: #818cf8;
}

td {
  padding: 8px 12px;
  vertical-align: middle;
  font-size: 0.8rem;
  color: var(--text);
  white-space: nowrap;
}

.col-status {
  text-align: center;
  width: 40px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background-color: #6b7280;
  border-radius: 50%;
  display: inline-block;
  transition: all 0.3s ease;
}

.status-dot.active {
  background-color: #10b981;
  box-shadow: 0 0 10px #10b981, 0 0 4px #10b981;
  animation: status-pulse-glow 1.8s infinite ease-in-out;
}

@keyframes status-pulse-glow {
  0%, 100% { opacity: 0.7; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

.env-name-text {
  font-weight: 800;
  font-size: 0.88rem;
  color: var(--text);
}

/* ⚡ 端口胶囊 */
.port-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 800;
  background: rgba(16, 185, 129, 0.08);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
  padding: 1px 6px;
  border-radius: 12px;
  font-family: monospace;
}

.port-badge.offline {
  background: rgba(120, 120, 120, 0.08);
  color: var(--text-muted);
  border-color: rgba(120, 120, 120, 0.2);
}

.port-badge.offline .badge-dot {
  background-color: #94a3b8;
  box-shadow: none;
  animation: none;
}

.badge-dot {
  width: 4px;
  height: 4px;
  background-color: #10b981;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 4px #10b981;
  animation: port-glow 1.5s infinite ease-in-out;
}

@keyframes port-glow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Git Branch */
.branch-cell-wrapper {
  display: block;
  width: 100%;
}

.branch-actions-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.clickable-branch {
  cursor: pointer;
  background: rgba(16, 185, 129, 0.06);
  color: #10b981;
  padding: 3px 12px;
  border-radius: 6px;
  font-weight: 750;
  font-size: 0.72rem;
  transition: all 0.2s ease;
  border: 1px solid rgba(16, 185, 129, 0.15);
  white-space: nowrap;
  max-width: none;
  text-overflow: ellipsis;
  overflow: hidden;
  text-align: left;
  display: inline-block;
  flex: 1;
  min-width: 0;
}

[data-theme="dark"] .clickable-branch {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}

.clickable-branch:hover {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.3);
}

.clickable-branch.branch-loading {
  background: rgba(245, 158, 11, 0.06);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.15);
}

.clickable-branch.copied,
[data-theme="dark"] .clickable-branch.copied {
  background: rgba(16, 185, 129, 0.16);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.4);
}

.branch-icon-buttons {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-icon-action {
  background: none;
  border: none;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.btn-icon-action:hover:not(:disabled) {
  opacity: 1;
  background: rgba(99, 102, 241, 0.08);
  transform: scale(1.1);
}

.btn-icon-action:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.btn-disabled,
.btn-disabled:hover {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Proxy Link */
.env-url-link {
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
  font-family: monospace;
  font-size: 0.72rem;
  border-bottom: 1px dashed transparent;
  transition: all 0.2s ease;
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.env-url-link:hover {
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.env-url-link.text-success-flash {
  color: #10b981;
  font-weight: 800;
}

/* Company */
.company-cell-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.company-cell-wrapper .company-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin: 0; /* 🚫 强力清除全局 margin-bottom: 1rem; */
  padding: 0 6px;
  font-size: 0.72rem;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  /* max-width: 180px; 🚀 调大最大宽度，展示更完整的企业名称 */
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
  box-sizing: border-box;
}

[data-theme="dark"] .company-cell-wrapper .company-badge {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.05);
}

.company-cell-wrapper .company-badge:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
}

.company-cell-wrapper .company-badge.badge-success-flash {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
}

.company-cell-wrapper .corp-id-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin: 0; /* 🚫 强力清除任何外部 margin */
  font-size: 0.65rem;
  font-family: monospace;
  background: rgba(99, 102, 241, 0.06);
  color: var(--primary);
  border: 1px solid rgba(99, 102, 241, 0.12);
  padding: 0 5px;
  border-radius: 3px;
  white-space: nowrap;
  box-sizing: border-box;
}

/* Auth Strategy */
.auth-strategy-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.auth-media-icon {
  font-size: 0.85rem;
}

.auth-media-name {
  font-size: 0.68rem;
  font-weight: 600;
  color: #6b7280;
  font-family: monospace;
}

.auth-key-pill {
  font-size: 0.65rem;
  background: rgba(99, 102, 241, 0.05);
  color: #6366f1;
  padding: 1px 5px;
  border-radius: 8px;
  font-family: monospace;
  white-space: nowrap;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

/* Actions */
.row-actions-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-actions-wrapper .btn {
  padding: 5px 10px;
  font-size: 0.72rem;
  font-weight: 750;
  border-radius: 6px;
  line-height: 1.2;
}

.actions-divider {
  width: 1px;
  height: 14px;
  background: rgba(0, 0, 0, 0.08);
  margin: 0 4px;
  display: inline-block;
}

[data-theme="dark"] .actions-divider {
  background: rgba(255, 255, 255, 0.08);
}

.action-btn {
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0.6;
  transform: scale(0.95);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}

.action-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.edit-env-btn:hover {
  color: #f59e0b;
}

.delete-env-btn:hover {
  color: #ef4444;
}

.detail-env-btn:hover {
  color: #3b82f6;
}
</style>
