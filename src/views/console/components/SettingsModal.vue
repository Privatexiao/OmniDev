<script setup>
import { ref, watch, nextTick } from 'vue'
import Modal from '../../../components/Modal.vue'

const props = defineProps({
  appConfig: {
    type: Object,
    default: () => ({})
  },
  downloadingUpdate: Boolean,
  downloadPercent: Number,
  downloadStatus: String,
  downloadError: String,
  downloadFilePath: String,
  installingAndExiting: Boolean
})

const emit = defineEmits(['success', 'message', 'download', 'install'])


const visible = ref(false)
const activeSettingsTab = ref('basic')
const savingAppConfig = ref(false)

const appConfigForm = ref({
  serverPort: 3300,
  frontendPort: 3000,
  defaultPort: 8080,
  maxPort: 8150,
  killServerOnClose: true,
  updateUrl: '',
  autoCheckUpdate: true
})

const appCloseBehavior = ref('ask')
const killEnvsOnClose = ref(false)
const exportWithPrivacy = ref(false)
const fileInput = ref(null)

// 导出目录相关状态
const EXPORT_DIR_KEY = 'omnidev_export_dir'
const exportDir = ref(localStorage.getItem(EXPORT_DIR_KEY) || '')
const exporting = ref(false)
const pickingDir = ref(false)
const lastExportPath = ref('')

// 导入相关状态
const showImportForm = ref(false)
const importPayload = ref(null)
const importProjectName = ref('')
const importProjectPath = ref('')
const importing = ref(false)
const importModalRef = ref(null)
const importResult = ref(null)

const show = (targetTab) => {
  if (targetTab && ['basic', 'window', 'cleanup', 'sync', 'logs', 'about'].includes(targetTab)) {
    activeSettingsTab.value = targetTab
  } else {
    activeSettingsTab.value = 'basic'
  }

  appConfigForm.value = {
    serverPort: props.appConfig.serverPort || 3300,
    frontendPort: props.appConfig.frontendPort || 3000,
    defaultPort: props.appConfig.defaultPort || 8080,
    maxPort: props.appConfig.maxPort || 8150,
    killServerOnClose: props.appConfig.killServerOnClose !== false,
    updateUrl: props.appConfig.updateUrl || '',
    autoCheckUpdate: props.appConfig.autoCheckUpdate !== false
  }

  lastExportPath.value = ''
  showImportForm.value = false
  importPayload.value = null
  importProjectName.value = ''
  importProjectPath.value = ''

  loadExportDir()
  appCloseBehavior.value = localStorage.getItem('appCloseBehavior') || 'ask'
  killEnvsOnClose.value = localStorage.getItem('killEnvsOnClose') === 'true'
  exportWithPrivacy.value = false
  visible.value = true
}

const hide = () => {
  visible.value = false
}


const loadExportDir = async () => {
  if (exportDir.value) return
  try {
    const res = await fetch('/api/config/default-export-dir')
    const data = await res.json()
    if (data.dir) exportDir.value = data.dir
  } catch (e) { /* ignore */ }
}

const saveExportDir = () => {
  const val = exportDir.value.trim()
  localStorage.setItem(EXPORT_DIR_KEY, val)
}

const exportConfig = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const dir = exportDir.value.trim()
    const params = new URLSearchParams()
    if (dir) params.append('dir', dir)
    if (exportWithPrivacy.value) params.append('includePrivacy', 'true')
    const url = `/api/config/export?${params.toString()}`
    const res = await fetch(url)
    const data = await res.json()
    if (res.ok && data.path) {
      lastExportPath.value = data.path
      emit('message', { text: `配置已导出到: ${data.path}`, type: 'success' })
    } else {
      emit('message', { text: data.error || '导出失败', type: 'danger' })
    }
  } catch (err) {
    emit('message', { text: '导出失败: ' + err.message, type: 'danger' })
  } finally {
    exporting.value = false
  }
}

const pickExportFolder = async () => {
  pickingDir.value = true
  try {
    const res = await fetch('/api/config/pick-folder', { method: 'POST' })
    const data = await res.json()
    if (!data.cancelled && data.dir) {
      exportDir.value = data.dir
      saveExportDir()
    }
  } catch (err) {
    emit('message', { text: `选择文件夹失败: ${err.message}`, type: 'danger' })
  } finally {
    pickingDir.value = false
  }
}

const openExportFolder = async () => {
  const target = lastExportPath.value || exportDir.value.trim()
  if (!target) return
  try {
    await fetch('/api/config/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target })
    })
  } catch (e) { /* ignore */ }
}

const triggerImportFile = () => {
  if (fileInput.value) fileInput.value.click()
}

const handleImportFile = async (e) => {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const configData = JSON.parse(text)
    if (!configData.envs) {
      emit('message', { text: '无效的导入文件：缺少 envs 数据', type: 'danger' })
      return
    }
    importPayload.value = configData
    importProjectName.value = configData._sourceName || ''
    importProjectPath.value = ''
    showImportForm.value = true
  } catch (err) {
    emit('message', { text: '解析导入文件失败: ' + err.message, type: 'danger' })
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

const confirmImport = async () => {
  const name = importProjectName.value.trim()
  if (!name) {
    emit('message', { text: '请输入新项目名称', type: 'warning' })
    return
  }
  if (!importPayload.value) return
  if (importing.value) return
  importing.value = true
  try {
    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configData: importPayload.value,
        projectName: name,
        projectPath: importProjectPath.value.trim()
      })
    })
    const data = await res.json()
    if (res.ok) {
      importResult.value = data
      importPayload.value = null
      showImportForm.value = false
      nextTick(() => {
        if (importModalRef.value) importModalRef.value.show()
      })
    } else {
      emit('message', { text: data.error || '导入失败', type: 'danger' })
    }
  } catch (err) {
    emit('message', { text: '导入失败: ' + err.message, type: 'danger' })
  } finally {
    importing.value = false
  }
}

const cancelImport = () => {
  showImportForm.value = false
  importPayload.value = null
  importProjectName.value = ''
  importProjectPath.value = ''
}

const handleImportModalConfirm = () => {
  if (importModalRef.value) importModalRef.value.hide()
  emit('success')
  hide()
}

const handleImportModalCancel = () => {
  if (importModalRef.value) importModalRef.value.hide()
  emit('success')
}

// 移除了 saveCloseBehavior 和 saveKillEnvsOnClose 方法以在点击统一的“保存”按钮时统一存储

const saveSettings = async () => {
  if (savingAppConfig.value) return
  savingAppConfig.value = true

  const oldPort = Number(props.appConfig.serverPort)
  const newPort = Number(appConfigForm.value.serverPort)
  const isPortChanged = !isNaN(oldPort) && !isNaN(newPort) && oldPort !== newPort

  try {
    // 1. 保存端口配置到后端
    const res = await fetch('/api/app-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appConfigForm.value)
    })
    const data = await res.json()
    if (!res.ok) {
      emit('message', { text: data.error || '保存端口配置失败', type: 'danger' })
      savingAppConfig.value = false
      return
    }

    // 2. 保存窗口关闭行为配置至 localStorage
    localStorage.setItem('appCloseBehavior', appCloseBehavior.value)
    localStorage.setItem('killEnvsOnClose', killEnvsOnClose.value ? 'true' : 'false')

    if (isPortChanged && window.__TAURI__) {
      emit('message', { text: `主控端口已由 ${oldPort} 调整为 ${newPort}，正在自动重启后端服务...`, type: 'info' })
      
      // 优雅关闭老端口的 Express 服务 (不强杀本地项目开发环境)
      try {
        await fetch('/api/system/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ killEnvs: false })
        })
      } catch (e) {
        // 关闭请求可能会因为进程瞬间销毁而抛出网络中断错误，这里安全捕获
      }

      // 延迟 800ms 让老进程彻底释放端口并关停
      await new Promise(resolve => setTimeout(resolve, 800))

      // 重新以新配置拉起服务
      try {
        const msg = await window.__TAURI__.core.invoke('start_backend_server')
        emit('message', { text: msg || `后端服务已成功重启并监听在 ${newPort} 端口！`, type: 'success' })
      } catch (err) {
        emit('message', { text: '重启新端口服务失败: ' + err, type: 'danger' })
      }
    } else {
      emit('message', { text: '设置已成功保存并立即生效！', type: 'success' })
    }

    emit('success')
    hide()
  } catch (err) {
    emit('message', { text: '保存失败: ' + err.message, type: 'danger' })
  } finally {
    savingAppConfig.value = false
  }
}

// ==================== 软件检查更新及应用内下载逻辑 ====================
const checkingUpdate = ref(false)
const updateResult = ref(null)

// 下载进度相关状态已通过 props 从 index.vue 传入


const openingLogFolder = ref(false)
const openLogFolder = async () => {
  if (openingLogFolder.value) return
  openingLogFolder.value = true
  try {
    const res = await fetch('/api/system/open-log-dir', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      emit('message', { text: data.error || '打开日志目录失败', type: 'danger' })
    }
  } catch (err) {
    emit('message', { text: '请求打开日志目录失败: ' + err.message, type: 'danger' })
  } finally {
    openingLogFolder.value = false
  }
}

const manualCheckUpdate = async () => {
  checkingUpdate.value = true
  updateResult.value = null
  try {
    const url = `/api/system/check-update?updateUrl=${encodeURIComponent(appConfigForm.value.updateUrl || '')}`
    const res = await fetch(url)
    const data = await res.json()
    updateResult.value = data
  } catch (err) {
    updateResult.value = {
      success: true,
      currentVersion: '0.1.0',
      latestVersion: '0.1.0',
      hasUpdate: false,
      changelog: '无法连接更新服务器。'
    }
  } finally {
    checkingUpdate.value = false
  }
}

// 监听 activeSettingsTab 变化，当切换到 'about' 标签时自动检查更新
watch(activeSettingsTab, (newTab) => {
  if (newTab === 'about' && !checkingUpdate.value) {
    manualCheckUpdate()
  }
})

const downloadNewVersion = (url) => {
  emit('download', url)
}

const confirmInstallAndExit = () => {
  emit('install')
}


defineExpose({ show, hide, visible })
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="hide">
    <div class="glass-card modal-content settings-modal animate-zoom">
      <div class="modal-header">
        <h3>⚙️ 系统设置</h3>
        <button class="btn-close" @click="hide">×</button>
      </div>

      <div class="settings-layout">
        <!-- 左侧 Tab 导航 -->
        <div class="settings-tabs">
          <button
            class="settings-tab-btn"
            :class="{ active: activeSettingsTab === 'basic' }"
            @click="activeSettingsTab = 'basic'"
          >
            💻 基础配置
          </button>
          <button
            class="settings-tab-btn"
            :class="{ active: activeSettingsTab === 'window' }"
            @click="activeSettingsTab = 'window'"
          >
            🔔 窗口行为
          </button>
          <button
            class="settings-tab-btn"
            :class="{ active: activeSettingsTab === 'cleanup' }"
            @click="activeSettingsTab = 'cleanup'"
          >
            🧹 系统清理
          </button>
          <button
            class="settings-tab-btn"
            :class="{ active: activeSettingsTab === 'sync' }"
            @click="activeSettingsTab = 'sync'"
          >
            🔄 同步与备份
          </button>
          <button
            class="settings-tab-btn"
            :class="{ active: activeSettingsTab === 'logs' }"
            @click="activeSettingsTab = 'logs'"
          >
            📂 运行日志
          </button>
          <button
            class="settings-tab-btn"
            :class="{ active: activeSettingsTab === 'about' }"
            @click="activeSettingsTab = 'about'"
          >
            ℹ️ 关于与更新
          </button>
        </div>

        <!-- 右侧内容 -->
        <div class="settings-content">
          <!-- 💻 基础配置 -->
          <div v-if="activeSettingsTab === 'basic'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">💻 端口与运行配置</h4>
              <p class="settings-desc">配置 OmniDev 控制台的基础服务运行及动态代理端口参数</p>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>控制台服务端口 (Express)</label>
                <input v-model.number="appConfigForm.serverPort" type="number" class="form-control" placeholder="例如: 3300" />
              </div>
              <div class="form-group">
                <label>前端本地代理端口 (Vite)</label>
                <input v-model.number="appConfigForm.frontendPort" type="number" class="form-control" placeholder="例如: 3000" />
              </div>
              <div class="form-group">
                <label>起始分配端口</label>
                <input v-model.number="appConfigForm.defaultPort" type="number" class="form-control" placeholder="默认: 8080" />
              </div>
              <div class="form-group">
                <label>最大分配端口</label>
                <input v-model.number="appConfigForm.maxPort" type="number" class="form-control" placeholder="默认: 8150" />
              </div>
            </div>
            <p class="form-help" style="margin-top: 12px;">
              ⚠️ 提示：端口修改将在下一次控制台彻底重启服务后生效。
            </p>
          </div>

          <!-- 🔔 窗口关闭偏好 -->
          <div v-if="activeSettingsTab === 'window'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">🔔 窗口关闭行为偏好</h4>
              <p class="settings-desc">设定点击控制台客户端右上角关闭按钮时的默认系统行为</p>
            </div>
            <div class="radio-group">
              <label class="radio-card" :class="{ active: appCloseBehavior === 'ask' }">
                <input type="radio" v-model="appCloseBehavior" value="ask" />
                <span class="radio-label">❓ 每次询问</span>
                <p class="radio-desc">弹出关闭选项对话框，自由选择是否同时停止本地服务。</p>
              </label>
              <label class="radio-card" :class="{ active: appCloseBehavior === 'minimize' }">
                <input type="radio" v-model="appCloseBehavior" value="minimize" />
                <span class="radio-label">📌 最小化到系统托盘</span>
                <p class="radio-desc">不退出进程，后台持续监控本地服务与日志状态。</p>
              </label>
              <div class="radio-card" :class="{ active: appCloseBehavior === 'close' }" @click="appCloseBehavior = 'close'">
                <input type="radio" v-model="appCloseBehavior" value="close" />
                <span class="radio-label">⛔ 直接彻底关闭并终止服务</span>
                <p class="radio-desc">退出应用，释放系统资源与端口占用。</p>
                <div class="sub-option-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(120, 120, 120, 0.2); display: flex; flex-direction: column; gap: 6px;" @click.stop>
                  <label class="checkbox-label" style="font-size: 11.5px; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <input type="checkbox" v-model="killEnvsOnClose" />
                    <span>同时强杀所有本地开发环境子进程</span>
                  </label>
                  <label class="checkbox-label" style="font-size: 11.5px; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <input type="checkbox" v-model="appConfigForm.killServerOnClose" />
                    <span>同时释放控制台自身服务端口 (3300端口)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- 🧹 系统清理 -->
          <div v-if="activeSettingsTab === 'cleanup'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">🧹 全局系统安全清理</h4>
              <p class="settings-desc">安全强杀所有项目注册的本地端口与残留子进程，释放系统资源</p>
            </div>
            <button class="btn-mini btn-mini-cancel" @click="emit('success')">
              🔄 一键强制回收全部项目资源
            </button>
          </div>

          <!-- 🔄 同步与备份 -->
          <div v-if="activeSettingsTab === 'sync'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">🔄 同步与备份</h4>
              <p class="settings-desc">导出当前项目环境及凭证架构为团队配置文件，或从他人处导入配置</p>
            </div>

            <!-- 导出 -->
            <div class="sync-card export-card">
              <h5>📤 导出当前配置</h5>
              <p class="sync-card-desc">将当前项目环境定义及凭证字段架构打包导出（所有敏感值默认已脱敏）</p>
              <div class="export-dir-row">
                <input
                  v-model="exportDir"
                  type="text"
                  class="form-control export-dir-input"
                  placeholder="导出目录路径..."
                  @blur="saveExportDir"
                  @keyup.enter="saveExportDir"
                />
                <button class="btn-mini btn-mini-cancel" :disabled="pickingDir" @click="pickExportFolder">
                  📂
                </button>
              </div>
              <div class="form-group" style="margin-bottom: 12px;">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="exportWithPrivacy" />
                  <span>是否连同隐私数据（密码和凭证内容）一起导出</span>
                </label>
              </div>
              <p v-if="lastExportPath" class="export-result">
                ✅ 已导出：<span class="export-path">{{ lastExportPath }}</span>
                <a href="#" class="open-folder-link" @click.prevent="openExportFolder">打开文件夹 ↗</a>
              </p>
              <button class="btn-mini btn-mini-primary sync-btn" :disabled="exporting" @click="exportConfig">
                {{ exporting ? '导出中...' : '导出' }}
              </button>
            </div>

            <!-- 导入 -->
            <div class="sync-card" v-if="!showImportForm">
              <h5>📥 导入团队配置</h5>
              <p class="sync-card-desc">从别人导出的配置包中登记为一个新的独立项目</p>
              <button class="btn-mini btn-mini-primary sync-btn import-btn" @click="triggerImportFile">导入</button>
              <input type="file" ref="fileInput" class="hidden-file-input" accept=".json" @change="handleImportFile" />
            </div>

            <div class="sync-card import-form-card" v-if="showImportForm">
              <h5>📥 确认导入</h5>
              <p class="sync-card-desc">
                已读取配置包，包含 <b>{{ Object.keys(importPayload?.envs || {}).length }}</b> 个环境定义。
              </p>
              <div class="import-form-fields">
                <div class="form-group">
                  <label>新项目名称</label>
                  <input v-model="importProjectName" type="text" class="form-control" placeholder="例如：测试" @keyup.enter="confirmImport" />
                </div>
                <div class="form-group">
                  <label>项目工作目录路径 (可选)</label>
                  <input v-model="importProjectPath" type="text" class="form-control" placeholder="例如：E:\projects\my-project" @keyup.enter="confirmImport" />
                </div>
              </div>
              <div class="import-form-actions">
                <button class="btn-mini btn-mini-cancel" @click="cancelImport">取消</button>
                <button class="btn-mini btn-mini-primary" :disabled="importing" @click="confirmImport">
                  {{ importing ? '导入中...' : '✅ 确认导入并注册为新项目' }}
                </button>
              </div>
            </div>
          </div>

          <!-- ℹ️ 关于与更新 -->
          <div v-if="activeSettingsTab === 'about'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">ℹ️ 关于与更新</h4>
              <p class="settings-desc">查看 OmniDev 版本信息及检查更新设置</p>
            </div>

            <div class="about-brand-card">
              <div class="brand-logo-area">
                <span class="brand-logo">🚀</span>
                <div class="brand-info">
                  <span class="brand-name">OmniDev 控制台</span>
                  <span class="brand-version">当前版本: v0.1.0</span>
                </div>
              </div>
              <p class="brand-desc">多环境一键启停与快捷同源免密登录开发者大盘控制台。</p>
            </div>

            <div class="form-group" style="margin-top: 16px; margin-bottom: 16px;">
              <label class="checkbox-label">
                <input type="checkbox" v-model="appConfigForm.autoCheckUpdate" />
                <span>启动软件时自动检查更新</span>
              </label>
            </div>

            <div class="update-action-row" style="margin-top: 16px; display: flex; gap: 8px;">
              <button class="btn-mini btn-mini-primary check-update-btn" :disabled="checkingUpdate" @click="manualCheckUpdate">
                {{ checkingUpdate ? '正在检查...' : '🔍 立即检查更新' }}
              </button>
            </div>

            <!-- 检查更新结果呈现 -->
            <div v-if="updateResult" class="update-result-card animate-fade-in" style="margin-top: 16px;">
              <div v-if="updateResult.hasUpdate" class="update-found">
                <div class="update-found-header">
                  <span class="update-badge">NEW</span>
                  <span class="update-title">发现新版本 v{{ updateResult.latestVersion }} !</span>
                </div>
                <div class="changelog-area">
                  <h5>📝 更新日志：</h5>
                  <pre>{{ updateResult.changelog }}</pre>
                </div>
                <!-- 🚀 应用内下载进度条与按钮自适应展示 -->
                <div class="download-progress-container" v-if="downloadingUpdate || downloadStatus === 'completed'">
                  <div class="progress-bar-wrapper">
                    <div class="progress-bar-fill" :style="{ width: downloadPercent + '%' }"></div>
                  </div>
                  <div class="progress-status-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span class="progress-percent" style="margin: 0; font-size: 12px; font-weight: 500;">
                      {{ downloadStatus === 'completed' ? '📥 下载完成！校验就绪' : `正在应用内下载安装包: ${downloadPercent}%` }}
                    </span>
                    <button
                      v-if="downloadStatus === 'completed'"
                      class="btn-mini btn-mini-primary"
                      :disabled="installingAndExiting"
                      @click="confirmInstallAndExit"
                      style="padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px;"
                    >
                      {{ installingAndExiting ? '正在拉起并退出...' : '⚡ 立即安装并退出' }}
                    </button>
                  </div>
                </div>
                <button
                  v-else
                  class="btn-mini btn-mini-primary download-update-btn"
                  @click="downloadNewVersion(updateResult.downloadUrl)"
                >
                  🚀 立即下载 ↗
                </button>
              </div>
              <div v-else class="update-not-found">
                <p class="update-success-msg">🎉 当前已是最新版本 (v{{ updateResult.currentVersion }})，无需更新。</p>
              </div>
            </div>
          </div>

          <!-- 📂 运行日志 -->
          <div v-if="activeSettingsTab === 'logs'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">📂 运行日志</h4>
              <p class="settings-desc">管理并定位 OmniDev 服务引擎所产生的本地运行日志</p>
            </div>
            
            <div class="logs-manager-card">
              <div class="logs-card-header">
                <span class="logs-card-icon">📂</span>
                <div class="logs-card-info">
                  <span class="logs-card-title">物理运行日志目录</span>
                  <span class="logs-card-desc">日志文件隔离存放在系统指定的本地 AppData 或运行根目录的 logs/ 文件夹下。</span>
                </div>
              </div>
              <p class="logs-help-text">
                当遇到 SSH 连接异常、服务被死锁占用、Git 构建冲突等故障排查场景时，建议打开本端日志以获取最完整的底噪及 stdout/stderr 输出。
              </p>
              <div style="margin-top: 16px;">
                <button class="btn-open-log-folder" :disabled="openingLogFolder" @click="openLogFolder">
                  📂 {{ openingLogFolder ? '正在打开目录...' : '打开运行日志目录' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="modal-footer" v-if="activeSettingsTab === 'basic' || activeSettingsTab === 'window' || activeSettingsTab === 'about'">
        <button class="btn-mini btn-mini-cancel" @click="hide">取消</button>
        <button class="btn-mini btn-mini-primary" :disabled="savingAppConfig" @click="saveSettings">
          {{ savingAppConfig ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- 导入成功弹窗 -->
    <Modal ref="importModalRef" title="✅ 导入成功" :showFooter="true" @confirm="handleImportModalConfirm" @cancel="handleImportModalCancel">
      <div class="import-success-body">
        <p class="import-success-intro">
          新项目 <b>「{{ importResult?.project?.name }}」</b> 已成功注册，包含
          <b>{{ importResult?.envCount || 0 }}</b> 个环境定义。
          <br />请按以下步骤完成配置：
        </p>
        <ol class="import-steps-list">
          <li>
            <strong>切换到新项目</strong>
            <p>关闭设置后在顶部导航栏切换至「{{ importResult?.project?.name }}」，后续所有操作将作用于该新项目。</p>
          </li>
          <li>
            <strong>填写在线环境账号密码</strong>
            <p>
              进入 <em>环境配置</em> 页面，为以下环境逐个填写 <b>线上账号</b> 与 <b>线上密码</b>：
              <span class="import-env-tags">
                <code v-for="env in (importResult?.envNames || [])" :key="env">{{ env }}</code>
              </span>
            </p>
          </li>
          <li>
            <strong>补填凭证字段</strong>
            <p>在 <em>环境配置 → 登录凭证</em> 中为每个环境补填真实登录凭据值（导入已自动创建了字段结构）。</p>
          </li>
        </ol>
      </div>
      <template #footer>
        <button class="btn-mini btn-mini-primary" @click="handleImportModalConfirm">知道了</button>
      </template>
    </Modal>


  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
  overflow-y: auto;
}

.modal-content {
  width: 100%;
  max-width: 780px;
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.settings-modal {
  max-width: 820px;
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
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid rgba(120, 120, 120, 0.1);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.settings-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-tabs {
  width: 160px;
  padding: 16px 8px;
  border-right: 1px solid rgba(120, 120, 120, 0.1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.settings-tab-btn {
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.settings-tab-btn:hover {
  background: rgba(120, 120, 120, 0.05);
  color: var(--text);
}

.settings-tab-btn.active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
  font-weight: 600;
}

.settings-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.settings-section {
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.settings-header {
  margin-bottom: 16px;
}

.settings-title {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--primary);
  font-weight: 700;
}

.settings-desc {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
}

.form-control {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(120, 120, 120, 0.2);
  background: rgba(120, 120, 120, 0.05);
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: var(--primary);
}

.form-help {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-card {
  display: block;
  padding: 10px 12px;
  border: 1px solid rgba(120, 120, 120, 0.15);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.radio-card.active {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.05);
}

.radio-card input[type="radio"] {
  display: none;
}

.radio-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.radio-desc {
  margin: 4px 0 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}

.sync-card {
  border: 1px solid rgba(120, 120, 120, 0.1);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.sync-card h5 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text);
}

.sync-card-desc {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--text-muted);
}

.export-card { }

.export-dir-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.export-dir-input {
  flex: 1;
}

.pick-dir-btn {
  flex-shrink: 0;
  min-width: 50px;
}

.export-result {
  margin: 8px 0;
  font-size: 12px;
  color: var(--text);
}

.export-path {
  color: var(--primary);
  font-weight: 500;
}

.open-folder-link {
  margin-left: 6px;
  color: var(--primary);
  text-decoration: none;
}

.sync-btn {
  margin-top: 4px;
}

.hidden-file-input {
  display: none;
}

.import-form-card { }

.import-form-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.import-form-fields .form-group label {
  font-size: 12px;
}

.import-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.import-success-body {
  color: var(--text);
}

.import-success-intro {
  font-size: 13px;
  line-height: 1.5;
}

.import-success-intro b {
  color: var(--primary);
}

.import-steps-list {
  margin: 12px 0;
  padding-left: 20px;
}

.import-steps-list li {
  margin-bottom: 8px;
}

.import-steps-list li strong {
  font-size: 13px;
}

.import-steps-list li p {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.import-env-tags {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}

.import-env-tags code {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
  font-size: 11px;
}

.btn-mini {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.btn-mini-cancel {
  background: rgba(120, 120, 120, 0.1);
  border-color: rgba(120, 120, 120, 0.15);
  color: var(--text);
}

.btn-mini-cancel:hover {
  background: rgba(120, 120, 120, 0.2);
}

.btn-mini-primary {
  background: var(--primary);
  color: #fff;
}

.btn-mini-primary:hover {
  opacity: 0.9;
}

.btn-mini-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================== 关于与更新特有样式 ==================== */
.about-brand-card {
  background: rgba(120, 120, 120, 0.05);
  border: 1px solid rgba(120, 120, 120, 0.12);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.brand-logo-area {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.brand-logo {
  font-size: 28px;
}

.brand-info {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.brand-version {
  font-size: 11px;
  color: var(--text-muted);
}

.brand-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text);
  line-height: 1.5;
}

.update-result-card, .update-error-card {
  background: rgba(99, 102, 241, 0.05);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 8px;
  padding: 14px;
}

.update-error-card {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.15);
}

.update-found-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.update-badge {
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.update-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.changelog-area {
  margin-bottom: 12px;
}

.changelog-area h5 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: var(--text);
}

.changelog-area pre {
  margin: 0;
  background: rgba(0, 0, 0, 0.15);
  padding: 10px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 11.5px;
  color: var(--text);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

[data-theme="light"] .changelog-area pre {
  background: rgba(0, 0, 0, 0.04);
}

.update-success-msg {
  margin: 0;
  font-size: 12px;
  color: #10b981;
  font-weight: 500;
}

.update-error-msg {
  margin: 0;
  font-size: 12px;
  color: #ef4444;
  font-weight: 500;
}

.download-update-btn {
  margin-top: 12px;
  background: var(--primary) !important;
  color: #fff !important;
  border: none !important;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.download-update-btn:hover {
  opacity: 0.92;
}

/* ==================== 应用内下载进度条样式 ==================== */
.download-progress-container {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar-wrapper {
  width: 100%;
  height: 8px;
  background: rgba(120, 120, 120, 0.15);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), #818cf8);
  border-radius: 4px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-percent {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

/* ==================== 运行日志选项卡特有样式 ==================== */
.logs-manager-card {
  padding: 16px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.02);
  border: 1px solid rgba(99, 102, 241, 0.08);
  margin-top: 10px;
  text-align: left;
}

[data-theme="dark"] .logs-manager-card {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.05);
}

.logs-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.logs-card-icon {
  font-size: 24px;
}

.logs-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logs-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.logs-card-desc {
  font-size: 11.5px;
  color: var(--text-muted);
}

.logs-help-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
  background: rgba(0, 0, 0, 0.02);
  padding: 10px 12px;
  border-radius: 6px;
  margin: 0;
  border-left: 3px solid var(--primary);
}

[data-theme="dark"] .logs-help-text {
  background: rgba(255, 255, 255, 0.02);
}

.btn-open-log-folder {
  background: var(--primary);
  border: 1px solid var(--primary);
  color: #ffffff;
  padding: 6px 14px;
  font-size: 0.72rem;
  font-weight: 750;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

.btn-open-log-folder:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}

.btn-open-log-folder:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
</style>
