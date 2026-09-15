<script setup>
/**
 * @file index.vue
 * @description 开发控制台主入口组件，整合项目切换、环境卡片列表、终端面板、系统设置、应用静默升级状态及窗口关闭行为
 */
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import ThemeSwitcher from './components/common/ThemeSwitcher.vue'
import StatusBadges from './components/common/StatusBadges.vue'
import ServerCard from './components/ServerCard.vue'
import EnvCard from './components/env/EnvCard.vue'
import TerminalPanel from './components/terminal/TerminalPanel.vue'
import Message from '../../components/Message.vue'
import { loginAdapters } from '../../utils/loginAdapters'
import { copyToClipboard, openExternal, prefersDarkScheme, watchColorScheme } from '../../utils/platform'
import ProjectModal from './components/project/ProjectModal.vue'
import CloseConfirmModal from './components/common/CloseConfirmModal.vue'
import EnvDetailModal from './components/env/EnvDetailModal.vue'
import EnvModal from './components/env/EnvModal.vue'
import SettingsModal from './components/settings/SettingsModal.vue'
import PortOccupiedModal from './components/common/PortOccupiedModal.vue'
import ProjectTabs from './components/project/ProjectTabs.vue'
import AppUpdater from './components/AppUpdater.vue'
import EnvBatchConfigModal from './components/env/EnvBatchConfigModal.vue'
import { useAppUpdate } from './composables/useAppUpdate'

// 核心数据状态
const envs = ref({})
const sshInfo = ref({})
const currentEnv = ref('')
const isRunning = ref(false)
const isSSHConnected = ref(false) // 🔌 新增 SSH 连接状态
const isServerConnected = ref(false)

const projectModalRef = ref(null)
const closeConfirmModalRef = ref(null)
const envDetailModalRef = ref(null)
const envModalRef = ref(null)
const settingsModalRef = ref(null)
const portOccupiedModalRef = ref(null)
const batchConfigModalRef = ref(null)

const openBatchConfigModal = () => {
  batchConfigModalRef.value?.show(envs.value)
}

// 🚀 应用级配置（从后端 /api/app-config 动态获取，消灭前端硬编码）
const appConfig = ref({
  appName: 'Dev Assistant',
  appDescription: '多环境一键启停与快捷登录控制台',
  serverPort: 3300,
  frontendPort: 3000
})

// 🚀 智能计算属性：提取大盘所有正在运行环境的客观真实状态，防止局部接口日志轮询时脏数据覆盖
const anyLocalServiceRunning = computed(() => {
  return Object.values(envs.value).some(e => e && e.running) || globalRunningServices.value.length > 0
})

const runningEnvsCount = computed(() => {
  return Object.values(envs.value).filter(e => e && e.running).length
})

// 🚀 全局跨项目正在运行的本地服务总揽状态
const globalRunningServices = ref([])
const stoppingEnvName = ref('')
const stopControlsLocked = ref(false)
let stopUnlockTimer = null
let envFetchSequence = 0

// 🚀 多项目多分支管理状态
const projects = ref([])
const activeProjectId = ref('')
const currentProjectName = computed(() => {
  const p = projects.value.find(item => item.id === activeProjectId.value)
  return p ? p.name : ''
})
// 🚀 系统设置唤起与数据更新回调
const openSettingsModal = () => {
  settingsModalRef.value?.show()
}

const handleSettingsSuccess = () => {
  fetchProjects()
  fetchAppConfig()
  fetchEnvs()
  // 同步本地缓存偏好
  appCloseBehavior.value = localStorage.getItem('appCloseBehavior') || 'ask'
}

// 🚀 系统偏好与窗口关闭行为配置
const appCloseBehavior = ref(localStorage.getItem('appCloseBehavior') || 'ask') // 'minimize' | 'close' | 'ask'

const executeCloseAction = async (behavior, forceKillServer = false) => {
  if (behavior === 'minimize') {
    if (window.__TAURI__) {
      try {
        const win = window.__TAURI__.window.getCurrentWindow()
        await win.hide()
      } catch (err) {
        showMessage(`Tauri 最小化失败: ${err.message || err}`, 'error')
        console.error('Tauri 隐藏窗口失败:', err)
      }
    } else {
      showMessage('当前处于浏览器环境，无法隐藏至系统托盘。', 'warning')
    }
  } else if (behavior === 'close') {
    const shouldKillServer = forceKillServer || appConfig.value.killServerOnClose !== false
    if (shouldKillServer) {
      showMessage('正在退出并释放服务端口...', 'info')
      try {
        // 🚀 从 localStorage 读取最新强杀配置，避免 Ref 同步延迟
        const shouldKillEnvs = localStorage.getItem('killEnvsOnClose') === 'true'
        await fetch('/api/system/shutdown', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ killEnvs: shouldKillEnvs })
        })
      } catch (e) {
        console.warn('后端销毁触发失败，可能已提前退出:', e.message)
      }
    }
    // 2. 0.5 秒延迟后彻底退出 Tauri 外壳容器
    setTimeout(async () => {
      if (window.__TAURI__) {
        try {
          const win = window.__TAURI__.window.getCurrentWindow()
          await win.destroy()
        } catch (err) {
          showMessage(`Tauri 退出失败: ${err.message || err}`, 'error')
          console.error('Tauri 退出进程失败:', err)
        }
      } else {
        window.close()
      }
    }, 500)
  }
}

const handleTauriCloseRequest = () => {
  const behavior = appCloseBehavior.value
  if (behavior === 'ask') {
    closeConfirmModalRef.value?.show()
  } else {
    executeCloseAction(behavior)
  }
}

const handleTauriExitRequest = () => {
  executeCloseAction('close', true)
}

const handleCloseConfirm = ({ choice, remember }) => {
  if (remember) {
    appCloseBehavior.value = choice
    localStorage.setItem('appCloseBehavior', choice)
  }
  executeCloseAction(choice)
}

// 🚀 全局 Message 提示系统状态
const messages = ref([])
const showMessage = (text, type = 'info') => {
  const id = Date.now() + Math.random().toString(36).substr(2, 9)
  messages.value.push({ id, text, type })
  setTimeout(() => {
    removeMessage(id)
  }, 4000)
}
const removeMessage = (id) => {
  messages.value = messages.value.filter(m => m.id !== id)
}

// 🚀 环境列表即时搜索过滤
const envSearchQuery = ref('')
const filteredEnvs = computed(() => {
  const query = envSearchQuery.value.trim().toLowerCase()
  if (!query) return envs.value || {}
  const result = {}
  for (const [name, config] of Object.entries(envs.value || {})) {
    if (!config) continue
    const matchName = String(name).toLowerCase().includes(query)
    const matchBranch = String(config.branch || '').toLowerCase().includes(query)
    const matchPort = String(config.port || '').includes(query)
    const matchCompany = String(config.company_name || '').toLowerCase().includes(query)
    if (matchName || matchBranch || matchPort || matchCompany) {
      result[name] = config
    }
  }
  return result
})



const normalizeCredentialFields = (raw) => {
  if (Array.isArray(raw)) {
    return raw
      .filter(item => item && item.key)
      .map(item => ({
        key: String(item.key || '').trim(),
        value: item.value || '',
        inject_type: item.inject_type || 'cookie',
        enabled: item.enabled !== false
      }))
  }
  // 智能自愈：兼容以前的对象 entries 脏数据结构 {"0": {"key": "corpid", "value": "964"}}
  return Object.entries(raw || {}).map(([key, val]) => {
    if (val && typeof val === 'object' && 'key' in val) {
      return {
        key: String(val.key || '').trim(),
        value: val.value || '',
        inject_type: val.inject_type || 'cookie',
        enabled: val.enabled !== false
      }
    }
    // 兜底以前的常规扁平键值对结构 {"corpid": "964"}
    return {
      key: String(key || '').trim(),
      value: val || '',
      inject_type: 'cookie',
      enabled: true
    }
  }).filter(item => item && item.key)
}



// 主题系统：支持 auto(跟随浏览器)、light(亮色，默认)、dark(暗色)
const themeMode = ref('light')
let mediaQueryListener = null

// 终端日志与网络轮询变量
const logs = ref('')
const selectedLogEnv = ref(localStorage.getItem('omnidev-selected-log-env') || '') // 🚀 选中的日志查看环境 (支持本地缓存，锁定现场)
let logInterval = null

// 主题计算与应用方法
const applyTheme = () => {
  let targetTheme = themeMode.value
  if (themeMode.value === 'auto') {
    targetTheme = prefersDarkScheme() ? 'dark' : 'light'
  }
  document.documentElement.setAttribute('data-theme', targetTheme)
}

const selectTheme = (mode) => {
  themeMode.value = mode
  localStorage.setItem('omnidev-theme-mode', mode)
  applyTheme()
}

const setupSystemThemeListener = () => {
  // 跨平台监听系统主题变化，watchColorScheme 内部已对不支持 matchMedia 的 Webview 兜底
  mediaQueryListener = watchColorScheme(() => {
    if (themeMode.value === 'auto') applyTheme()
  })
}

// 🚀 接口交互：获取全局项目注册列表与激活指针
const fetchProjects = async () => {
  try {
    const res = await fetch('/api/projects')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    projects.value = data.projects || []
    activeProjectId.value = data.activeProjectId || ''
    return true
  } catch (err) {
    console.error('加载项目列表失败:', err)
    return false
  }
}

// 🚀 接口交互：切换激活项目 Tab 选项卡
const selectProject = async (id) => {
  if (activeProjectId.value === id) return
  try {
    const res = await fetch('/api/projects/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id })
    })
    if (res.ok) {
      activeProjectId.value = id
      // 切换项目后，立刻重新从后端拉取该项目的最新全局配置与环境状态
      await fetchAppConfig()
      await fetchEnvs()
    } else {
      const errData = await res.json()
      showMessage(errData.error || '切换项目分支失败', 'error')
    }
  } catch (err) {
    showMessage('连接控制端失败，请检查服务是否运行: ' + err.message, 'error')
  }
}

// 🚀 接口交互：打开新增项目弹窗
const openAddProject = () => {
  projectModalRef.value?.show('add')
}

// 🚀 接口交互：打开修改项目弹窗并回显数据
const openEditProject = (proj) => {
  projectModalRef.value?.show('edit', proj)
}

// 🚀 接口交互：安全下线并彻底删除登记的项目
const deleteProject = async (id, name) => {
  if (!confirm(`⚠️ 确定要删除项目分支 [${name}] 吗？\n\n注意：此操作将安全停止所有运行中的子服务进程，并物理清除对应的专属配置文件，但不会物理删除您的代码文件。`)) {
    return
  }
  try {
    const res = await fetch('/api/projects/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id })
    })
    const data = await res.json()
    if (res.ok) {
      showMessage(data.message, 'success')
      await fetchProjects()
      await fetchAppConfig()
      await fetchEnvs()
    } else {
      showMessage(data.error || '删除项目失败', 'error')
    }
  } catch (err) {
    showMessage('连接控制端失败: ' + err.message, 'error')
  }
}

const handleProjectSaved = async () => {
  await fetchProjects()
  await fetchAppConfig()
  await fetchEnvs()
}

// 🚀 自定义环境管理：打开新增环境弹窗
const openAddEnv = () => {
  // showMessage('正在调起“新增环境”配置面板...', 'info')
  envModalRef.value?.show('add')
}

// 🚀 自定义环境管理：打开修改环境弹窗并回显数据
const openEditEnv = (name, config) => {
  envModalRef.value?.show('edit', name, config)
}

// 🚀 自定义环境管理：打开查看详情弹窗并回显数据
const openDetailModal = (name, config) => {
  envDetailModalRef.value?.show(name, config)
}

// 拷贝文本辅助方法 (在 index.vue 模板中使用)
const copyText = async (text) => {
  if (!text) return
  const ok = await copyToClipboard(text)
  showMessage(ok ? '已成功复制至剪贴板' : '复制失败，请重试', ok ? 'success' : 'error')
}

// 🚀 自定义环境管理：安全下线并彻底删除指定的自定义开发环境
const handleDeleteEnv = async (name) => {
  const envKey = name;
  const displayName = envKey;
  if (!confirm(`⚠️ 确定要彻底删除自定义环境 [${displayName}] 吗？\n\n此操作将安全下线服务，并永久移除该环境的所有配置，不可恢复！`)) {
    return;
  }
  try {
    const res = await fetch('/api/envs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envKey })
    });
    const data = await res.json();
    if (res.ok) {
      showMessage(data.message || `环境 [${displayName}] 已成功下线并移除配置！`, 'success');
      if (selectedLogEnv.value === envKey) {
        updateSelectedLogEnv('');
      }
      await fetchEnvs();
    } else {
      showMessage(data.error || '删除环境失败', 'error');
    }
  } catch (err) {
    showMessage('网络连接失败: ' + err.message, 'error');
  }
}


// 异步加载服务器与环境配置 (已自愈支持多项目环境动态映射)
// 异步加载服务器与环境配置 (已自愈支持多项目环境动态映射与无闪烁增量更新)
const fetchEnvs = async () => {
  const requestSequence = ++envFetchSequence
  try {
    const res = await fetch('/api/envs')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (requestSequence !== envFetchSequence) return false
    const newEnvs = data.envs || {}
    globalRunningServices.value = data.allRunningServices || []
    
    // 🔒 采用极致顺滑的【增量精细化更新】算法，只更新发生变化的属性（如 running、port 等状态）
    // 保证 Vue 的响应式引用对象 envs.value 不发生大范围替换，彻底消灭列表抖动、重新渲染与闪烁！
    const currentEnvs = envs.value || {}
    
    // 1. 清除在 newEnvs 中已经不存在的环境
    for (const key in currentEnvs) {
      if (!newEnvs[key]) {
        delete currentEnvs[key]
      }
    }
    
    // 2. 增量更新或追加
    for (const key in newEnvs) {
      if (!currentEnvs[key]) {
        currentEnvs[key] = newEnvs[key]
      } else {
        const currentItem = currentEnvs[key]
        const newItem = newEnvs[key]

        // 🔒 逐字段增量同步：只覆盖发生变化的字段（含 local_port 等编辑后配置），
        // 复用同一对象引用，既消灭列表抖动，又确保保存后的新配置不会被漏更新。
        for (const field in newItem) {
          if (JSON.stringify(currentItem[field]) !== JSON.stringify(newItem[field])) {
            currentItem[field] = newItem[field]
          }
        }
        // 清理后端已删除、但本地仍残留的字段，保持与最新配置完全一致
        for (const field in currentItem) {
          if (!(field in newItem)) {
            delete currentItem[field]
          }
        }
      }
    }
    
    // 手动触发一次 Vue 的响应式收集（以便视图得到最新状态响应）
    // 3. 按照后端新返回的环境顺序，重建对象键的物理插入顺序，彻底隔离并纠正项目间环境排序
    const orderedEnvs = {}
    for (const key in newEnvs) {
      if (currentEnvs[key]) {
        orderedEnvs[key] = currentEnvs[key]
      }
    }
    envs.value = orderedEnvs

    sshInfo.value = data.server_ssh || {}
    currentEnv.value = data.currentEnv
    isRunning.value = data.isRunning
    isServerConnected.value = true
    return true
  } catch (err) {
    if (requestSequence === envFetchSequence) {
      isServerConnected.value = false
    }
    console.error('加载环境列表失败:', err);
    return false
  }
}

// 🚀 鼠标悬浮右上角徽章时按需懒加载全局启动服务状态
const handleBadgesHover = async () => {
  try {
    await fetchEnvs()
  } catch (e) {
    // 静默忽略
  }
}

// 🚀 端口冲突自愈重启成功后的回调
const handlePortResetSuccess = async () => {
  setTimeout(async () => {
    await fetchAppConfig()
    await fetchProjects()
    await fetchEnvs()
  }, 1000)
}

// 🔌 一键启动后端服务 (Tauri 命令)
const handleStartServer = async () => {
  if (window.__TAURI__) {
    try {
      const msg = await window.__TAURI__.core.invoke('start_backend_server')
      showMessage(msg || '后端服务启动中，请稍候...', 'success')
      setTimeout(async () => {
        await fetchAppConfig()
        await fetchProjects()
        await fetchEnvs()
      }, 1000)
    } catch (err) {
      if (err && String(err).includes('PORT_OCCUPIED:')) {
        const port = String(err).split(':')[1] || '3300'
        portOccupiedModalRef.value?.show(port)
      } else {
        showMessage('启动失败: ' + (err || '未知错误'), 'error')
      }
    }
  } else {
    showMessage('当前处于浏览器环境，请在终端执行 node server.js 启动服务', 'warning')
  }
}

const terminalType = ref('remote') // 'remote' | 'local'

const handleTypeChange = (type) => {
  terminalType.value = type
  fetchLogs()
}

// 🚀 终端日志与控制台核心逻辑：获取实时日志并同步状态
const fetchLogs = async () => {
  const targetEnv = selectedLogEnv.value || currentEnv.value
  if (!targetEnv) return
  try {
    const res = await fetch(`/api/logs?env=${encodeURIComponent(targetEnv)}&type=${terminalType.value}`)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.logs)) {
        logs.value = data.logs.join('\n')
      } else {
        logs.value = data.logs || ''
      }
      isSSHConnected.value = !!data.isSSHConnected
      isRunning.value = !!data.isRunning
    }
  } catch (err) {
    console.error('拉取终端日志失败:', err)
  }
}

// 🚀 终端日志与控制台核心逻辑：清空日志
const clearLogs = async () => {
  const targetEnv = selectedLogEnv.value || currentEnv.value
  if (!targetEnv) return
  logs.value = `正在清空环境 [${targetEnv}] 的专属终端日志...\n`
  try {
    const res = await fetch('/api/logs/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: targetEnv })
    })
    if (res.ok) {
      logs.value = ''
    } else {
      const data = await res.json()
      logs.value = `[System Error] 清空日志失败: ${data.error || '未知错误'}\n`
    }
  } catch (err) {
    logs.value = `[System Error] 连接控制端清空日志失败: ${err.message}\n`
  }
}

// 终端轮询感知
const startLogPolling = () => {
  if (logInterval) clearInterval(logInterval)
  logInterval = setInterval(fetchLogs, 1000)
}

// 🚀 日志面板展开/收起时，按需启停日志轮询（收起时立即停止，展开时立即启动）
const handleTerminalCollapseChange = (collapsed) => {
  if (collapsed) {
    stopLogPolling()
  } else {
    fetchLogs()
    startLogPolling()
  }
}

// 🚀 日志查看环境选择逻辑 (支持本地缓存并立即加载专属日志，无需监听器)
const updateSelectedLogEnv = async (val) => {
  const cleanVal = val || ''
  selectedLogEnv.value = cleanVal
  localStorage.setItem('omnidev-selected-log-env', cleanVal)
  if (cleanVal) {
    // 💡 优化 UX 体验：如果当前没有内容，不显示容易误导的"正在加载"状态，直接让 fetchLogs 从服务端获取最真实的内容状态填充
    if (!logs.value) {
      logs.value = ''
    }
    await fetchLogs()
  }
}

const stopLogPolling = () => {
  if (logInterval) {
    clearInterval(logInterval)
    logInterval = null
  }
}

// 业务交互：一键启动本地开发服务进程
const startEnv = async (name) => {
  const displayName = name;
  const config = envs.value[name];
  if (config && config.disable_start) {
    showMessage('当前环境已禁用本地开发服务启动', 'warning');
    return;
  }
  try {
    isRunning.value = true
    currentEnv.value = displayName
    updateSelectedLogEnv(displayName) // 🚀 启动时自动将日志查看器选项卡切到该环境并写入缓存！
    logs.value = `正在拉起本地开发服务 [${displayName}]...\n`
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: name })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || '启动失败，请检查项目路径和 package.json scripts')
    }
    showMessage(data.message || `环境 [${displayName}] 已启动`, 'success')
    // 🚀 启动后快速刷新环境列表，以捕获最新分配的端口映射
    await fetchEnvs()
    startLogPolling()
  } catch (err) {
    console.error('启动失败:', err)
    isRunning.value = false
    showMessage(`启动失败: ${err.message}`, 'error')
  }
}

// 业务交互：安全关停本地服务进程 (精准强杀特定环境进程)
const stopEnv = async (target) => {
  const service = target && typeof target === 'object' ? target : null
  const name = service?.envName || target
  const projectId = service?.projectId || ''
  const displayName = name
  const stoppingKey = projectId ? `${projectId}#${name}` : name
  if (stopControlsLocked.value) return

  stopControlsLocked.value = true
  stoppingEnvName.value = stoppingKey
  try {
    logs.value = `正在强行关闭本地服务环境 [${displayName}] 残留端口进程...\n`
    const res = await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: name, projectId })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || '停止本地服务失败')
    }
    // 🚀 关停后刷新状态，物理熄灭卡片绿点与端口胶囊
    await fetchEnvs()
    showMessage(data.message || `环境 [${displayName}] 已停止`, 'success')
  } catch (err) {
    console.error('停止失败:', err)
    showMessage(`停止失败: ${err.message}`, 'error')
  } finally {
    stoppingEnvName.value = ''
    if (stopUnlockTimer) clearTimeout(stopUnlockTimer)
    // 条目移除后短暂保持锁定，避免连点落到下一个环境。
    stopUnlockTimer = setTimeout(() => {
      stopControlsLocked.value = false
      stopUnlockTimer = null
    }, 600)
  }
}

// 业务交互：基于插拔式通用动态适配器完成凭证注入，并一键跳转登录主开发系统或关联子项目
const launchEnv = async (name, config, targetType = 'online') => {
  // 🤖 智能一键自动免密登录 (支持有头浏览器模拟填表登录，仅当目标为线上 online 时启用)
  const enabledCredentials = normalizeCredentialFields(config.credentials)
    .filter(c => c.enabled !== false && c.key && c.value !== '')
  const hasCredentials = enabledCredentials.length > 0
  const hasOnlyCookieCredentials = hasCredentials && enabledCredentials.every(c => c.inject_type === 'cookie')

  if (targetType === 'local' && hasOnlyCookieCredentials) {
    try {
      showMessage('正在预注入 Cookie，并使用默认浏览器打开本地页面...', 'info')
      const res = await fetch('/api/envs/prepare-local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envKey: name })
      })
      const data = await res.json()
      if (!res.ok || !data.bridgeUrl) throw new Error(data.error || '生成本地登录地址失败')
      const opened = await openExternal(data.bridgeUrl)
      showMessage(opened ? 'Cookie 已在页面加载前注入，正在打开本地环境...' : '默认浏览器打开失败', opened ? 'success' : 'error')
    } catch (err) {
      showMessage(`Cookie 注入失败: ${err.message}`, 'error')
    }
    return
  }

  const isOnlineAuto = targetType === 'online' && config.login_url && config.online_username && config.online_password
  const shouldUseCredentialBrowser = hasCredentials

  if (isOnlineAuto || shouldUseCredentialBrowser) {
    try {
      showMessage(shouldUseCredentialBrowser ? '🤖 正在预注入登录凭证并拉起独立浏览器...' : '🤖 正在拉起一键登录浏览器...', 'success')
      const res = await fetch('/api/envs/autologin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envKey: name, targetType })
      })
      const data = await res.json()
      if (res.ok) {
        showMessage(data.message || '正在拉起浏览器，请稍候...', 'success')
      } else {
        showMessage(data.error || '拉起一键登录失败', 'error')
      }
    } catch (err) {
      showMessage(`一键登录失败: ${err.message}`, 'error')
    }
    return
  }

  // 降级兜底逻辑：常规 Cookie / localStorage / sessionStorage 免密跳转
  try {
    let targetLink = '{{VUE_DEV_HOST}}';
    if (targetType === 'local' && config.running && config.port) {
      let subPath = config.local_login_path || '';
      if (subPath) {
        subPath = subPath.trim();
        if (subPath.startsWith('http://') || subPath.startsWith('https://')) {
          try {
            const urlObj = new URL(subPath);
            subPath = urlObj.pathname + urlObj.search + urlObj.hash;
          } catch (e) {
            subPath = subPath.replace(/^https?:\/\/[^\/]+/, '');
          }
        }
        if (subPath && !subPath.startsWith('/')) {
          const slashIdx = subPath.indexOf('/');
          if (slashIdx > 0) {
            const firstPart = subPath.substring(0, slashIdx);
            if (!firstPart.includes('#')) {
              subPath = subPath.substring(slashIdx);
            }
          }
        }
      }
      if (!subPath) {
        const devHost = config.VUE_DEV_HOST || '';
        try {
          if (devHost.startsWith('http://') || devHost.startsWith('https://')) {
            const urlObj = new URL(devHost);
            subPath = urlObj.pathname + urlObj.search + urlObj.hash;
          } else if (devHost) {
            subPath = devHost.startsWith('/') ? devHost : '/' + devHost;
          }
        } catch (e) {
          subPath = '';
        }
      }
      if (subPath && !subPath.startsWith('/')) {
        subPath = '/' + subPath;
      }
      targetLink = `http://localhost:${config.port}${subPath}`;
    }

    const activeConfig = {
      ...config,
      credentials: normalizeCredentialFields(config.credentials),
      custom_link: targetLink
    };

    const adapter = loginAdapters.dynamic;
    console.log(`[DevAssistant] 启动开发环境 [${name}], 鉴权媒介: ${activeConfig.auth_type}, 类型: ${targetType}`);

    const targetUrl = adapter.execute(activeConfig);

    if (targetUrl) {
      const opened = await openExternal(targetUrl);
      if (opened) {
        showMessage(`🎉 开发凭证已成功注入！正在直达${targetType === 'local' ? '本地' : '线上'}页面...`, 'success');
      } else {
        showMessage('浏览器拦截了新窗口，请手动复制链接打开，或允许本站弹窗后重试。', 'warning');
      }
    } else {
      showMessage('跳转链接生成失败，请检查相关域名与路径配置！', 'warning');
    }
  } catch (err) {
    console.error('环境跳转启动失败:', err);
    showMessage(`跳转启动失败: ${err.message}`, 'error');
  }
}

// 🚀 加载应用级配置（从后端读取品牌、项目预设等，消灭前端硬编码）
const fetchAppConfig = async () => {
  try {
    const res = await fetch('/api/app-config')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    appConfig.value = { ...appConfig.value, ...data }
    return true
  } catch (err) {
    console.error('加载应用配置失败:', err)
    return false
  }
}

// 🚀 全局模态弹窗滚动穿透自适应锁定机制（防止模态框开启时最外层 body 产生任何恶性滚动穿透）
const isAnyModalOpen = computed(() => {
  return (
    settingsModalRef.value?.visible ||
    projectModalRef.value?.visible ||
    closeConfirmModalRef.value?.visible ||
    envDetailModalRef.value?.visible ||
    envModalRef.value?.visible ||
    portOccupiedModalRef.value?.visible ||
    batchConfigModalRef.value?.visible ||
    false
  )
})

watch(isAnyModalOpen, (isOpen) => {
  if (typeof document !== 'undefined') {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }
})

// 生命周期挂载与卸载
let envInterval = null
let unlistenTauriClose = null
let unlistenTauriExit = null
let autoUpdateTimer = null

// ==================== 自动检查与签名应用内更新逻辑 (Composable) ====================
const {
  showUpdateBanner,
  latestUpdateInfo,
  downloadingUpdate,
  downloadPercent,
  downloadStatus,
  downloadError,
  showInstallConfirm,
  installingAndExiting,
  autoCheckAppUpdate,
  downloadNewVersion,
  resetDownloadState,
  confirmInstallAndExit,
  stopDownloadPolling
} = useAppUpdate(appConfig, showMessage)


// 🚀 开启大盘环境列表温和的后台静默轮询 (5秒一次，配合后端 0ms 零损耗探针完美实现状态自动亮起)
const startEnvPolling = () => {
  stopEnvPolling()
  envInterval = setInterval(fetchEnvs, 5000)
}

const stopEnvPolling = () => {
  if (envInterval) {
    clearInterval(envInterval)
    envInterval = null
  }
}

onMounted(async () => {
  // 💡 并行拉取品牌配置与全局项目列表，加速首屏无闪烁呈现
  try {
    const [configReady, projectsReady] = await Promise.all([
      fetchAppConfig(),
      fetchProjects()
    ])
    if (!configReady || !projectsReady) throw new Error('控制端基础接口尚未就绪')
    // 💡 获取完基本配置与项目信息后，加载具体的环境，避免前端自愈兜底时 projects 列表尚未加载完
    const envsReady = await fetchEnvs()
    if (!envsReady) throw new Error('环境接口尚未就绪')
  } catch (err) {
    // 💡 容错自愈：如果初始化加载全部连接失败，说明本地服务未启动或被冲突挂起，在桌面外壳下尝试自动拉起
    if (window.__TAURI__) {
      try {
        await window.__TAURI__.core.invoke('start_backend_server')
        setTimeout(async () => {
          await fetchAppConfig()
          await fetchProjects()
          await fetchEnvs()
        }, 1000)
      } catch (startErr) {
        if (startErr && String(startErr).includes('PORT_OCCUPIED:')) {
          const port = String(startErr).split(':')[1] || '3300'
          portOccupiedModalRef.value?.show(port)
        }
      }
    }
  }

  startEnvPolling()
  // 🚀 日志轮询不再默认启动，仅在日志面板展开时按需启动
  const savedCollapsed = localStorage.getItem('terminal_collapsed')
  if (savedCollapsed === 'false') {
    startLogPolling()
  }
  themeMode.value = localStorage.getItem('omnidev-theme-mode') || 'light'
  applyTheme()
  setupSystemThemeListener()
  window.addEventListener('keydown', handleEscClose)
  
  // 💡 如果在 Tauri 环境中运行，使用官方标准的高精度 IPC 广播监听，彻底杜绝浏览器差异
  if (window.__TAURI__) {
    window.__TAURI__.event.listen('tauri-close-requested', () => {
      handleTauriCloseRequest()
    }).then(unlistenFn => {
      unlistenTauriClose = unlistenFn
    }).catch(err => {
      console.error('Tauri 注册关闭事件监听失败:', err)
    })

    window.__TAURI__.event.listen('tauri-exit-requested', () => {
      handleTauriExitRequest()
    }).then(unlistenFn => {
      unlistenTauriExit = unlistenFn
    }).catch(err => {
      console.error('Tauri 注册退出事件监听失败:', err)
    })
  } else {
    // 网页模式或开发调试兜底，以防万一
    window.addEventListener('tauri-close-requested', handleTauriCloseRequest)
    window.addEventListener('tauri-exit-requested', handleTauriExitRequest)
  }

  // 💡 延迟 3 秒静默检查更新，提升启动加载速度体验
  autoUpdateTimer = setTimeout(() => {
    autoCheckAppUpdate()
    autoUpdateTimer = null
  }, 3000)

})

// 🚀 ESC 键全局拦截：按优先级关闭最上层弹窗（子弹窗优先于父弹窗）
const handleEscClose = (e) => {
  if (e.key !== 'Escape') return
  // 如果有覆盖安装确认弹窗正在显示，ESC键也应按需拦截
  if (showInstallConfirm.value) { showInstallConfirm.value = false; return }
  // 子弹窗最优先关闭
  if (envModalRef.value?.showCredentialFieldModal) { envModalRef.value.showCredentialFieldModal = false; return }
  if (closeConfirmModalRef.value?.visible) { closeConfirmModalRef.value.hide(); return }
  if (portOccupiedModalRef.value?.visible) {
    if (!portOccupiedModalRef.value.processing) {
      portOccupiedModalRef.value.hide()
    }
    return
  }
  // 主弹窗按打开频率排序
  if (batchConfigModalRef.value?.visible) { batchConfigModalRef.value.hide(); return }
  if (settingsModalRef.value?.visible) { settingsModalRef.value.hide(); return }
  if (envDetailModalRef.value?.visible) { envDetailModalRef.value.hide(); return }
  if (envModalRef.value?.visible) { envModalRef.value.hide(); return }
  if (projectModalRef.value?.visible) { projectModalRef.value.hide(); return }
}

const handleLaunchLocalFromBadge = (env) => {
  const name = env.envName
  if (env.projectId && env.projectId !== activeProjectId.value) {
    openExternal(`http://localhost:${env.port}`)
    return
  }
  const config = envs.value[name]
  if (config) {
    launchEnv(name, config, 'local')
  } else {
    openExternal(`http://localhost:${env.port}`)
  }
}

onUnmounted(() => {
  stopLogPolling()
  stopEnvPolling()
  stopDownloadPolling()
  if (autoUpdateTimer) {
    clearTimeout(autoUpdateTimer)
    autoUpdateTimer = null
  }
  if (stopUnlockTimer) {
    clearTimeout(stopUnlockTimer)
    stopUnlockTimer = null
  }
  window.removeEventListener('keydown', handleEscClose)
  
  if (unlistenTauriClose) {
    unlistenTauriClose()
    unlistenTauriClose = null
  }
  if (unlistenTauriExit) {
    unlistenTauriExit()
    unlistenTauriExit = null
  }
  window.removeEventListener('tauri-close-requested', handleTauriCloseRequest)
  window.removeEventListener('tauri-exit-requested', handleTauriExitRequest)
  
  if (mediaQueryListener) {
    // watchColorScheme 返回的是取消监听的清理函数
    mediaQueryListener()
    mediaQueryListener = null
  }
})

</script>

<template>
  <div class="app-header" style="position: relative; z-index: 100;">
    <div class="title-area">
      <div class="title-row">
        <h1>控制台</h1>
        <div class="header-actions" style="display: flex; align-items: center; gap: 12px;">
          <button class="btn-settings-toggle" @click="openSettingsModal" title="系统设置">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3"/></svg>
            <span>系统设置</span>
          </button>
          <ThemeSwitcher v-model="themeMode" @update:modelValue="selectTheme" />
        </div>
      </div>
      <p>{{ appConfig.appDescription }}</p>
    </div>
    <StatusBadges
      :isServerConnected="isServerConnected"
      :isRunning="anyLocalServiceRunning"
      :allEnvs="globalRunningServices"
      :serverPort="appConfig.serverPort"
      :stoppingEnvName="stoppingEnvName"
      :stopControlsLocked="stopControlsLocked"
      @mouseenter="handleBadgesHover"
      @start-server="handleStartServer"
      @stop-env="stopEnv"
      @launch-local="handleLaunchLocalFromBadge"
    />
  </div>

  <!-- ⚙️ 系统设置模态框 -->
  <SettingsModal
    ref="settingsModalRef"
    :appConfig="appConfig"
    :downloadingUpdate="downloadingUpdate"
    :downloadPercent="downloadPercent"
    :downloadStatus="downloadStatus"
    :downloadError="downloadError"
    :installingAndExiting="installingAndExiting"
    @success="handleSettingsSuccess"
    @message="({ text, type }) => showMessage(text, type)"
    @download="downloadNewVersion"
    @reset-download="resetDownloadState"
  />

  <!-- ❓ 关闭软件确认询问模态框 -->
  <CloseConfirmModal ref="closeConfirmModalRef" @confirm="handleCloseConfirm" />

  <!-- ⚠️ 端口冲突自愈处理模态框 -->
  <PortOccupiedModal
    ref="portOccupiedModalRef"
    @success="handlePortResetSuccess"
    @message="({ text, type }) => showMessage(text, type)"
  />

  <!-- 📂 多项目多分支管理选项卡大栏 (使用 ProjectTabs 解耦组件) -->
  <ProjectTabs
    :projects="projects"
    :activeProjectId="activeProjectId"
    @select-project="selectProject"
    @add-project="openAddProject"
    @edit-project="openEditProject"
    @delete-project="deleteProject"
  />

  <!-- 🎛️ 大盘核心掌控中枢 (3列并列卡片群：本地引擎、远程链路、工作区矩阵) -->
  <div class="dashboard-hub-grid" v-if="activeProjectId">
    <!-- 1. 本地服务引擎卡片 -->
    <div class="hub-card local-engine-hub glass-card">
      <div class="hub-card-header">
        <div class="hub-header-title">
          <span class="hub-icon">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="10" height="10" rx="2"/>
              <circle cx="8" cy="8" r="2"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>
            </svg>
          </span>
          <span>本地服务引擎</span>
        </div>
        <span class="hub-badge" :class="runningEnvsCount > 0 ? 'badge-running' : 'badge-idle'">
          <span class="hub-badge-dot"></span>
          <span>{{ runningEnvsCount > 0 ? '服务运行中' : '就绪待命' }}</span>
        </span>
      </div>
      <div class="hub-card-body">
        <div class="hub-metric-row">
          <span class="hub-metric-num">{{ runningEnvsCount }}</span>
          <span class="hub-metric-divider">/</span>
          <span class="hub-metric-denom">{{ Object.keys(envs).length }}</span>
          <span class="hub-metric-unit">活跃服务</span>
        </div>
      </div>
      <div class="hub-card-footer">
        <span class="hub-tip-text">支持本地环境独立并发调试</span>
      </div>
    </div>

    <!-- 2. 远程部署集群卡片 -->
    <ServerCard
      :sshInfo="sshInfo"
      @updated="fetchEnvs"
    />

    <!-- 3. 当前工作空间卡片 -->
    <div class="hub-card workspace-hub glass-card">
      <div class="hub-card-header">
        <div class="hub-header-title">
          <span class="hub-icon">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zM2 6h12M6 6v8"/>
            </svg>
          </span>
          <span>当前工作空间</span>
        </div>
        <span class="hub-badge badge-neutral">
          <span>{{ currentProjectName || '默认项目' }}</span>
        </span>
      </div>
      <div class="hub-card-body">
        <div class="hub-metric-row">
          <span class="hub-metric-num">{{ Object.keys(envs).length }}</span>
          <span class="hub-metric-unit">组环境配置</span>
        </div>
      </div>
      <div class="hub-card-footer workspace-footer">
        <span class="hub-tip-text">独立配置矩阵与端口隔离</span>
        <button class="hub-action-btn" @click="openBatchConfigModal" title="集中快速调整当前项目各环境的本地端口、登录账号与密码">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3.5h12M2 8h12M2 12.5h12M5 1.5v4M11 6v4M7 10.5v4"/></svg>
          <span>环境集中配置</span>
        </button>
      </div>
    </div>
  </div>

  <div class="main-layout">
    <div class="left-section">
      <!-- 只有在登记了项目分支时才渲染卡片，否则显示温润且科技感十足的空状态面板 -->
      <div v-if="projects.length > 0" class="left-section-container">
        <div class="env-section-header">
          <div class="header-left">
            <span class="header-icon">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9zM2 6h12M6 6v8"/></svg>
            </span>
            <h2>本地开发环境</h2>
          </div>
          <div class="header-right-actions">
            <div class="search-input-wrapper">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
              <input 
                v-model="envSearchQuery" 
                type="text" 
                placeholder="搜索环境、分支或端口..." 
                class="env-search-input"
              />
              <button v-if="envSearchQuery" class="clear-search-btn" @click="envSearchQuery = ''">✕</button>
            </div>
            <button class="btn-add-env-btn" @click="openAddEnv" title="在当前项目下新增开发环境">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
              <span>新增环境</span>
            </button>
          </div>
        </div>

        <div class="env-table-container glass-card animate-zoom" v-if="Object.keys(filteredEnvs).length > 0">
          <table class="env-table">
            <thead>
              <tr>
                <th style="width: 48px; text-align: center;">状态</th>
                <th style="width: 160px;">环境名</th>
                <th style="width: 120px; text-align: center;">本地端口</th>
                <th>Git 远程分支</th>
                <th style="width: 180px; text-align: right; padding-right: 18px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <EnvCard 
                v-for="(config, name) in filteredEnvs" 
                :key="name" 
                :name="String(name)" 
                :config="config" 
                :isRunning="config.running" 
                :port="config.port"
                :currentEnv="currentEnv"
                @startEnv="startEnv(name)" 
                @stopEnv="stopEnv(name)" 
                @launchEnv="launchEnv(name, config, 'online')"
                @launchLocalEnv="launchEnv(name, config, 'local')"
                @pathUpdated="fetchEnvs"
                @message="({ text, type }) => showMessage(text, type)"
                @editEnv="openEditEnv"
                @deleteEnv="handleDeleteEnv"
                @showDetail="openDetailModal"
              />
            </tbody>
          </table>
        </div>
        <div class="glass-card empty-tab-envs-panel animate-zoom" v-else>
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
          </div>
          <h3>暂无开发环境</h3>
          <p>当前项目尚未创建任何开发环境。</p>
          <button class="tab-btn-add" style="margin: 12px auto 0; display: inline-flex;" @click="openAddEnv">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
            <span>新建环境</span>
          </button>
        </div>
      </div>
      <div class="glass-card empty-projects-panel animate-zoom" v-else>
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3>暂未登记开发项目</h3>
        <p>控制台下方需要读取您本地的 Vue 项目开发环境。请点击上方<b>【新增项目】</b>登记您的本地项目磁盘物理绝对路径。</p>
        <button class="tab-btn-add" style="margin: 0 auto; display: inline-flex;" @click="openAddProject">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
          <span>立即登记新项目</span>
        </button>
      </div>
    </div>
      <TerminalPanel 
        :logs="logs" 
        :envs="envs" 
        :currentEnv="currentEnv" 
        :isRunning="isRunning"
        :isSSHConnected="isSSHConnected"
        :activeSubproject="activeTab"
        :modelValue="selectedLogEnv"
        @update:modelValue="updateSelectedLogEnv"
        @clearLogs="clearLogs"
        @message="({ text, type }) => showMessage(text, type)"
        @refreshLogs="fetchLogs"
        @typeChange="handleTypeChange"
        @collapseChange="handleTerminalCollapseChange"
      />
  </div>

  <!-- 📂 项目分支管理模态框 (包含新增与编辑) -->
  <ProjectModal ref="projectModalRef" @success="handleProjectSaved" @message="({ text, type }) => showMessage(text, type)" />

  <!-- 🔍 统一规范开发环境详情高透玻璃态模态对话框 (与登记新项目完全一致的经典结构) -->
  <!-- 🔍 统一规范开发环境详情模态框 -->
  <EnvDetailModal ref="envDetailModalRef" @message="({ text, type }) => showMessage(text, type)" />

  <!-- ➕/✏️ 新增或修改开发环境模态框 -->
  <EnvModal
    ref="envModalRef"
    @success="fetchEnvs"
    @message="({ text, type }) => showMessage(text, type)"
  />
  
  <!-- 🚀 全局 Message 提示挂载点 -->

  <Message :messages="messages" @close="removeMessage" />

  <!-- 📥 应用更新与安装校验（由 Composable 提供状态控制，AppUpdater 封装 UI） -->
  <AppUpdater
    v-model:showUpdateBanner="showUpdateBanner"
    v-model:showInstallConfirm="showInstallConfirm"
    :latestUpdateInfo="latestUpdateInfo"
    :installingAndExiting="installingAndExiting"
    @viewUpdate="settingsModalRef?.show('about')"
    @confirmInstall="confirmInstallAndExit"
  />

  <!-- 🎛️ 项目环境集中配置工作台 (端口、账号、密码及扩展字段) -->
  <EnvBatchConfigModal
    ref="batchConfigModalRef"
    :projectId="activeProjectId"
    :projectName="currentProjectName"
    @updated="fetchEnvs"
    @message="({ text, type }) => showMessage(text, type)"
  />
</template>


<style scoped>
/* 🎛️ 大盘核心掌控中枢 (3列并列卡片网格) */
.dashboard-hub-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 16px 0 22px 0;
}

.hub-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 20px;
  min-height: 120px;
  border-radius: var(--radius-card, 20px);
  box-sizing: border-box;
}

.hub-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.hub-header-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--text-secondary);
  letter-spacing: var(--tracking-caps, 0.045em);
  text-transform: uppercase;
}

.hub-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  opacity: 0.85;
}

.hub-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: var(--radius-pill, 980px);
  font-size: 11px;
  font-weight: 550;
  letter-spacing: -0.006em;
}

.hub-badge.badge-running {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success, #34c759);
  border: 1px solid rgba(52, 199, 89, 0.22);
}

.hub-badge.badge-idle {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .hub-badge.badge-idle {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.06);
}

.hub-badge.badge-neutral {
  background: rgba(0, 102, 204, 0.07);
  color: var(--color-brand, #0066cc);
  border: 1px solid rgba(0, 102, 204, 0.18);
}

[data-theme="dark"] .hub-badge.badge-neutral {
  background: rgba(41, 151, 255, 0.12);
  color: #2997ff;
  border-color: rgba(41, 151, 255, 0.25);
}

.hub-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: currentColor;
}

.badge-running .hub-badge-dot {
  animation: hub-pulse-glow 1.8s infinite ease-in-out;
}

@keyframes hub-pulse-glow {
  0%, 100% { opacity: 0.6; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.25); }
}

.hub-card-body {
  margin-bottom: 8px;
}

.hub-metric-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.hub-metric-num {
  font-size: 2.1rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.035em;
  color: var(--text);
  font-family: "SF Pro Display", BlinkMacSystemFont, sans-serif;
}

.hub-metric-divider {
  font-size: 1.1rem;
  color: var(--text-muted);
  font-weight: 400;
  margin: 0 1px;
}

.hub-metric-denom {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-muted);
}

.hub-metric-unit {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 6px;
}

.hub-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.74rem;
  color: var(--text-muted);
  padding-top: 8px;
  margin-top: 4px;
  min-height: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
}

[data-theme="dark"] .hub-card-footer {
  border-top-color: rgba(255, 255, 255, 0.05);
}

.hub-tip-text {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: -0.006em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 9px;
  height: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: var(--radius-pill, 980px);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  flex-shrink: 0;
  vertical-align: middle;
}

.hub-action-btn svg {
  display: block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.hub-action-btn span {
  display: inline-block;
  line-height: 1;
}

[data-theme="dark"] .hub-action-btn {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.hub-action-btn:hover:not(:disabled) {
  background: var(--surface, #ffffff);
  color: var(--color-brand, #0066cc);
  border-color: rgba(0, 102, 204, 0.25);
  transform: translateY(-0.5px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .hub-action-btn:hover:not(:disabled) {
  background: #2c2c2e;
  color: #2997ff;
  border-color: rgba(41, 151, 255, 0.3);
}

/* 🔍 环境即时搜索过滤框与头部操作区 (苹果极简浅灰微凹槽) */
.header-right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.045);
  border: none;
  border-radius: var(--radius-pill, 980px);
  padding: 0 12px 0 14px;
  height: 34px;
  color: var(--text-secondary);
  transition: all 0.24s cubic-bezier(0.4, 0, 0.6, 1);
}

[data-theme="dark"] .search-input-wrapper {
  background: rgba(255, 255, 255, 0.06);
}

.search-input-wrapper:focus-within {
  background: var(--surface, #ffffff);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.16);
  color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .search-input-wrapper:focus-within {
  background: #24252c;
  box-shadow: 0 0 0 3px rgba(41, 151, 255, 0.25);
}

.env-search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  letter-spacing: var(--tracking-body, -0.006em);
  color: var(--text);
  padding: 0 8px;
  width: 180px;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-input-wrapper:focus-within .env-search-input {
  width: 240px;
}

.clear-search-btn {
  border: none;
  background: transparent;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 50%;
  line-height: 1;
  transition: color 0.15s ease;
}

.clear-search-btn:hover {
  color: var(--text);
}
.projects-tabs-bar {
  margin: 0.8rem 0;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 4px 20px rgba(31, 38, 135, 0.03);
  transition: all 0.3s ease;
}

[data-theme="dark"] .projects-tabs-bar {
  background: rgba(15, 23, 42, 0.4);
  border-color: rgba(255, 255, 255, 0.08);
}

.tabs-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  box-sizing: border-box;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .tab-btn {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(99, 102, 241, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);
}

[data-theme="dark"] .tab-btn:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(99, 102, 241, 0.45);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.tab-btn.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-color);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
  transform: translateY(-0.5px);
}

[data-theme="dark"] .tab-btn.active {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-color);
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.12);
}

.tab-icon {
  font-size: 0.95rem;
  opacity: 0.85;
  transition: transform 0.2s ease;
}

.tab-btn:hover .tab-icon {
  transform: scale(1.1);
}

.tab-name {
  font-size: 0.82rem;
  font-weight: 750;
  color: var(--text);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  transition: color 0.2s ease;
}

.tab-btn.active .tab-name {
  color: var(--btn-primary-color);
}


.tab-btn-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px dashed rgba(99, 102, 241, 0.25);
  color: var(--primary);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
  margin-left: auto;
}

.tab-btn-add:hover {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
  transform: translateY(-1px);
}

/* 模态弹窗 */
/* 全局通用模态对话框样式已迁移至全局 style.css，此处仅保留控制台专属样式 */

/* 🦾 启动前远程软链切换 - 与输入框样式完全对齐的开关框 */
.switch-box-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 42px; /* 与普通输入框高度绝对对齐 */
  padding: 0 14px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
  box-sizing: border-box;
  transition: all 0.2s ease;
}

[data-theme="dark"] .switch-box-control {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(15, 23, 42, 0.4);
}

.switch-desc-text {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-weight: 500;
}

.ios-switch-btn {
  position: relative;
  width: 46px;
  height: 24px;
  background: rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 100px;
  cursor: pointer;
  outline: none;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

[data-theme="dark"] .ios-switch-btn {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.02);
}

.ios-switch-btn.checked {
  background: linear-gradient(135deg, #10b981, #059669); /* 开启时呈现极致质感的翡翠绿渐变 */
  border-color: rgba(16, 185, 129, 0.2);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}

.switch-dot {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 20px;
  height: 20px;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ios-switch-btn.checked .switch-dot {
  left: calc(100% - 21px);
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);
}

.form-help-tip {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
  margin: 0;
}

/* 通用弹窗内容、页头、页脚、表单控件及动作按钮已移至全局 style.css */

/* 🚀 高级交互悬浮操作面板与空状态样式 */
.tab-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  animation: fadeInActions 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes fadeInActions {
  from {
    opacity: 0;
    transform: translateX(5px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

[data-theme="dark"] .action-btn {
  background: rgba(255, 255, 255, 0.06);
}

.tab-btn.active .action-btn {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
}

.action-btn:hover {
  transform: scale(1.15);
}

.action-btn.edit:hover {
  background: #eab308;
  color: #ffffff;
}

.action-btn.delete:hover {
  background: #ef4444;
  color: #ffffff;
}

.empty-projects-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.5rem 2rem;
  text-align: center;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(20px);
  border: 1px dashed rgba(99, 102, 241, 0.3);
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.04);
  margin-bottom: 1.5rem;
}

[data-theme="dark"] .empty-projects-panel {
  background: rgba(15, 23, 42, 0.45);
  border-color: rgba(99, 102, 241, 0.2);
}

.empty-projects-panel .empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  animation: projectBounce 2s infinite;
}

.empty-projects-panel h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.15rem;
  font-weight: 850;
  color: var(--text);
}

.empty-projects-panel p {
  margin: 0 0 1.5rem 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 400px;
}

@keyframes projectBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* ==========================================
   📂 环境自定义管理新增与修改弹窗 premium 样式
   ========================================== */

.env-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  padding: 0 4px;
}

.env-section-header .header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.env-section-header .header-left .header-icon {
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
}

.env-section-header h2 {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  margin: 0;
  color: var(--text);
}

.btn-add-env-btn {
  background: var(--color-brand, #0066cc);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: var(--tracking-body, -0.006em);
  border-radius: var(--radius-pill, 980px);
  padding: 0 16px;
  height: 34px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 102, 204, 0.25);
  transition: all 0.24s cubic-bezier(0.4, 0, 0.6, 1);
  outline: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
}

.btn-add-env-btn:hover {
  background: var(--color-brand-hover, #0077ed);
  box-shadow: 0 3px 8px rgba(0, 102, 204, 0.35);
  transform: translateY(-0.5px);
}

.btn-add-env-btn:active {
  transform: scale(0.975);
}

.env-modal-content {
  width: 760px;
  max-width: 95%;
}

.env-modal-body {
  max-height: 64vh;
  overflow-y: auto;
  padding: 24px;
}

.env-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 20px;
  row-gap: 14px;
}

.span-full {
  grid-column: 1 / span 2;
}

.form-control.text-area-cmd {
  font-family: monospace;
  font-size: 0.76rem;
  line-height: 1.4;
  resize: vertical;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 10px;
}

[data-theme="dark"] .form-control.text-area-cmd {
  background: rgba(255, 255, 255, 0.02);
}

/* 弹窗局部滚动条打磨 */
.env-modal-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.env-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.env-modal-body::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.25);
  border-radius: 9999px;
  transition: background 0.3s ease;
}

.env-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.6);
}

[data-theme="dark"] .env-modal-body::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.16);
}

[data-theme="dark"] .env-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.65);
}

/* 📦 自定义 Cookie 缓存注入样式 */
.custom-cookies-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px dashed rgba(99, 102, 241, 0.15);
}

[data-theme="dark"] .custom-cookies-section {
  border-top-color: rgba(99, 102, 241, 0.25);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-title-row h4 {
  font-size: 0.92rem;
  font-weight: 700;
  color: #4f46e5;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

[data-theme="dark"] .section-title-row h4 {
  color: #818cf8;
}

.btn-add-cookie-btn {
  font-size: 0.72rem;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  border: 1px dashed rgba(99, 102, 241, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-add-cookie-btn:hover {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.section-tip {
  font-size: 0.72rem;
  line-height: 1.4;
  color: #64748b;
  margin-bottom: 12px;
}

[data-theme="dark"] .section-tip {
  color: #94a3b8;
}

.cookie-items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cookie-item-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cookie-item-row .key-input {
  flex: 3;
  font-family: monospace;
  font-size: 0.75rem;
}

.cookie-item-row .value-input {
  flex: 5;
  font-family: monospace;
  font-size: 0.75rem;
}

.btn-delete-cookie {
  font-size: 0.72rem;
  padding: 6px 10px;
  background: rgba(239, 68, 68, 0.06);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.btn-delete-cookie:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

.field-with-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
  align-items: center;
}

.credential-field-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 34px;
  gap: 8px;
  align-items: center;
}

.inject-type-select {
  min-width: 0;
}

@media (max-width: 680px) {
  .credential-field-row {
    grid-template-columns: 1fr 34px;
  }

  .credential-field-row .inject-type-select {
    grid-column: 1 / span 2;
  }
}

.icon-delete-btn {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.06);
  color: #ef4444;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}

.icon-delete-btn:hover {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

.cookie-empty-tip {
  font-size: 0.72rem;
  color: #94a3b8;
  text-align: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.01);
  border-radius: 8px;
  border: 1px dashed rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .cookie-empty-tip {
  background: rgba(255, 255, 255, 0.01);
  border-color: rgba(255, 255, 255, 0.05);
  color: #64748b;
}

/* ==========================================
   📂 子项目 Tab 选项卡与高级表单 CSS
   ========================================== */

.subproject-tabs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .subproject-tabs-row {
  background: rgba(30, 41, 59, 0.2);
  border-color: rgba(255, 255, 255, 0.05);
}

.tab-pill {
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-pill:hover {
  background: rgba(99, 102, 241, 0.05);
  color: #6366f1;
}

.tab-pill.active {
  background: white;
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.15);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.06);
}

[data-theme="dark"] .tab-pill.active {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: none;
}

/* 分类环境为空时的高级提示卡 */
.empty-tab-envs-panel {
  text-align: center;
  padding: 40px 20px;
  border-radius: 16px;
  border: 1px dashed rgba(99, 102, 241, 0.15);
  background: rgba(255, 255, 255, 0.3);
}

.empty-tab-envs-panel h3 {
  font-size: 1.1rem;
  font-weight: 750;
  margin: 12px 0 6px;
  color: var(--text);
}

.empty-tab-envs-panel p {
  font-size: 0.8rem;
  color: var(--text-muted);
  max-width: 420px;
  margin: 0 auto;
}



.code-input {
  font-family: monospace;
  font-size: 0.8rem;
}

.sub-section-title {
  display: flex;
  align-items: center;
  font-size: 0.82rem;
  font-weight: 800;
  color: #6366f1;
  border-bottom: 2px solid rgba(99, 102, 241, 0.1);
  padding-bottom: 6px;
  margin: 15px 0 5px 0;
}

[data-theme="dark"] .sub-section-title {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.2);
}

/* 🏢 统一高阶立体浮雕表格布局 */
.env-table-container {
  overflow-x: auto;
  border-radius: 16px;
  background: var(--panel-bg);
  border: var(--border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 8px 24px -4px rgba(0, 0, 0, 0.05);
  margin-top: 12px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.env-table-container:hover {
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04), 0 12px 32px -4px rgba(0, 0, 0, 0.07);
}

[data-theme="dark"] .env-table-container {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 8px 24px -4px rgba(0, 0, 0, 0.4);
}

[data-theme="dark"] .env-table-container:hover {
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 12px 32px -4px rgba(0, 0, 0, 0.5);
}

.env-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.env-table th {
  background: rgba(0, 0, 0, 0.02);
  padding: 12px 14px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

[data-theme="dark"] .env-table th {
  background: rgba(255, 255, 255, 0.02);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}
/* ==========================================
   🔍 极简高对比度环境详情模态框 CSS
   ========================================== */
.env-detail-modal {
  width: 680px;
  max-width: 95%;
  background: var(--panel-bg);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

[data-theme="dark"] .env-detail-modal {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.env-highlight-name {
  color: #4f46e5;
  font-weight: 700;
}

[data-theme="dark"] .env-highlight-name {
  color: #818cf8;
}

.detail-section {
  margin-bottom: 20px;
  background: rgba(0, 0, 0, 0.01);
  border-radius: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

[data-theme="dark"] .detail-section {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.03);
}

.detail-section .section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #374151;
  margin: 0 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 6px;
}

[data-theme="dark"] .detail-section .section-title {
  color: #e5e7eb;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 12px;
}

.detail-label {
  font-size: 0.85rem;
  font-weight: 550;
  color: #4b5563;
  min-width: 150px;
  white-space: nowrap;
}

[data-theme="dark"] .detail-label {
  color: #9ca3af;
}

.detail-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
  word-break: break-all;
}

[data-theme="dark"] .detail-value {
  color: #f3f4f6;
}

.detail-value.text-important {
  color: #4f46e5;
  font-weight: 700;
}

[data-theme="dark"] .detail-value.text-important {
  color: #a5b4fc;
}

.detail-value.text-link {
  color: #2563eb;
  font-family: monospace;
  font-size: 0.88rem;
  text-decoration: underline;
  text-underline-offset: 2px;
}

[data-theme="dark"] .detail-value.text-link {
  color: #60a5fa;
}

.detail-value.text-code {
  font-family: monospace;
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

[data-theme="dark"] .detail-value.text-code {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
}

.detail-value.text-success {
  color: #16a34a;
  font-weight: 700;
}

[data-theme="dark"] .detail-value.text-success {
  color: #4ade80;
}

.detail-value.text-danger {
  color: #dc2626;
  font-weight: 700;
}

[data-theme="dark"] .detail-value.text-danger {
  color: #f87171;
}

.truncate-value {
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

.btn-copy-mini {
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #4f46e5;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy-mini:hover {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
}

[data-theme="dark"] .btn-copy-mini {
  color: #a5b4fc;
  background: rgba(165, 180, 252, 0.08);
  border-color: rgba(165, 180, 252, 0.3);
}

[data-theme="dark"] .btn-copy-mini:hover {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}

.dynamic-credentials {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}

[data-theme="dark"] .dynamic-credentials {
  border-top-color: rgba(255, 255, 255, 0.1);
}

.dynamic-credentials .sub-section-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #4b5563;
  margin: 0 0 10px 0;
  text-transform: uppercase;
}

[data-theme="dark"] .dynamic-credentials .sub-section-title {
  color: #9ca3af;
}

/* 🚀 系统设置齿轮按钮交互样式 */
.btn-settings-toggle {
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: var(--text);
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-pill, 9999px);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .btn-settings-toggle {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.btn-settings-toggle:hover {
  background: var(--surface, #ffffff);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  transform: translateY(-0.5px);
}

[data-theme="dark"] .btn-settings-toggle:hover {
  background: #2c2c2e;
  border-color: rgba(255, 255, 255, 0.12);
}

.btn-settings-toggle:active {
  transform: translateY(0);
}

/* 💫 切换 Tab 淡入升起动效 */
.animate-fade-in {
  animation: tabFadeIn 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

</style>
