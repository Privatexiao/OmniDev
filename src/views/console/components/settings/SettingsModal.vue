<script setup>
/**
 * @file SettingsModal.vue
 * @description 系统设置模态框容器组件，负责协调和切换多个系统配置子选项卡（基础、窗口、清理、同步、关于等）的保存与状态同步
 */
import { ref } from 'vue'
import SettingsBasic from './SettingsBasic.vue'
import SettingsWindow from './SettingsWindow.vue'
import SettingsSync from './SettingsSync.vue'
import SettingsAbout from './SettingsAbout.vue'

const props = defineProps({
  appConfig: {
    type: Object,
    default: () => ({})
  },
  downloadingUpdate: {
    type: Boolean,
    default: false
  },
  downloadPercent: {
    type: Number,
    default: 0
  },
  downloadStatus: {
    type: String,
    default: 'idle'
  },
  downloadError: {
    type: String,
    default: null
  },
  installingAndExiting: {
    type: Boolean,
    default: false
  },
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['success', 'message', 'download', 'reset-download'])

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
  autoCheckUpdate: true,
  logKeepType: '3',
  logKeepDaysCustom: 30
})

const appCloseBehavior = ref('ask')
const killEnvsOnClose = ref(false)

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
    autoCheckUpdate: props.appConfig.autoCheckUpdate !== false,
    logKeepType: props.appConfig.logKeepType || '3',
    logKeepDaysCustom: props.appConfig.logKeepDaysCustom || 30
  }

  appCloseBehavior.value = localStorage.getItem('appCloseBehavior') || 'ask'
  killEnvsOnClose.value = localStorage.getItem('killEnvsOnClose') === 'true'
  visible.value = true
}

const hide = () => {
  visible.value = false
}

const handleOverlayClick = () => {
  if (props.closeOnOverlayClick) {
    hide()
  }
}

const waitForBackendReady = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const res = await fetch('/api/app-config')
      if (res.ok) return
    } catch (e) { /* 等待新端口服务启动 */ }
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error('新端口服务启动超时')
}

const saveSettings = async () => {
  if (savingAppConfig.value) return
  savingAppConfig.value = true

  const oldPort = Number(props.appConfig.serverPort)
  const newPort = Number(appConfigForm.value.serverPort)
  const isPortChanged = !isNaN(oldPort) && !isNaN(newPort) && oldPort !== newPort

  try {
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

    localStorage.setItem('appCloseBehavior', appCloseBehavior.value)
    localStorage.setItem('killEnvsOnClose', killEnvsOnClose.value ? 'true' : 'false')

    if (isPortChanged && window.__TAURI__) {
      emit('message', { text: `主控端口已由 ${oldPort} 调整为 ${newPort}，正在自动重启后端服务...`, type: 'info' })
      try {
        await fetch('/api/system/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ killEnvs: false })
        })
      } catch (e) { /* ignore */ }

      await new Promise(resolve => setTimeout(resolve, 800))

      let newBackendStartRequested = false
      try {
        const msg = await window.__TAURI__.core.invoke('start_backend_server')
        newBackendStartRequested = true
        window.__OMNIDEV_BACKEND_PORT__ = newPort
        await waitForBackendReady()
        emit('message', { text: msg || `后端服务已成功重启并监听在 ${newPort} 端口！`, type: 'success' })
      } catch (err) {
        if (newBackendStartRequested) {
          emit('message', { text: `新端口 ${newPort} 已发起启动，但健康检查超时，请稍后重试或重启 OmniDev：${err}`, type: 'danger' })
          return
        }
        try {
          await window.__TAURI__.core.invoke('save_server_port', { port: oldPort })
          window.__OMNIDEV_BACKEND_PORT__ = oldPort
          await window.__TAURI__.core.invoke('start_backend_server')
          await waitForBackendReady()
          emit('message', { text: `新端口启动失败，已恢复旧端口 ${oldPort}：${err}`, type: 'danger' })
        } catch (rollbackErr) {
          emit('message', { text: `新端口启动失败，旧端口也未能自动恢复：${err}；${rollbackErr}`, type: 'danger' })
        }
        return
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

const cleaningAllResources = ref(false)
const cleanAllResources = async () => {
  if (cleaningAllResources.value) return
  cleaningAllResources.value = true
  try {
    emit('message', { text: '正在清理所有残留进程与端口绑定，请稍候...', type: 'info' })
    const res = await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    const data = await res.json()
    if (res.ok) {
      emit('message', { text: data.message || '已成功清理并回收全部项目资源！', type: 'success' })
      emit('success')
      hide()
    } else {
      emit('message', { text: data.error || '强制回收资源失败', type: 'danger' })
    }
  } catch (err) {
    emit('message', { text: '请求强制回收失败: ' + err.message, type: 'danger' })
  } finally {
    cleaningAllResources.value = false
  }
}

defineExpose({ show, hide, visible })
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleOverlayClick">
    <div class="glass-card modal-content settings-modal animate-zoom">
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-box brand">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </div>
          <div>
            <h3 class="modal-title">系统偏好设置</h3>
            <p class="modal-desc">管理 OmniDev 端口、窗口行为、运行日志与多端同步配置</p>
          </div>
        </div>
        <button class="btn-close press-spring" @click="hide" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      <div class="settings-layout">
        <!-- 左侧 Tab 导航 -->
        <div class="settings-tabs">
          <button class="settings-tab-btn" :class="{ active: activeSettingsTab === 'basic' }" @click="activeSettingsTab = 'basic'">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="2.5" width="12" height="8.5" rx="1.5"/><path d="M5 14h6M8 11v3"/></svg>
            <span>基础配置</span>
          </button>
          <button class="settings-tab-btn" :class="{ active: activeSettingsTab === 'window' }" @click="activeSettingsTab = 'window'">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="2.5" width="12" height="10" rx="2"/><path d="M2 5.5h12M5 4h.01M7.5 4h.01"/></svg>
            <span>窗口行为</span>
          </button>
          <button class="settings-tab-btn" :class="{ active: activeSettingsTab === 'cleanup' }" @click="activeSettingsTab = 'cleanup'">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 4.5h12M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M4 4.5l.8 9.2a1.5 1.5 0 0 0 1.5 1.3h3.4a1.5 1.5 0 0 0 1.5-1.3l.8-9.2M6.5 7.5v4M9.5 7.5v4"/></svg>
            <span>系统清理</span>
          </button>
          <button class="settings-tab-btn" :class="{ active: activeSettingsTab === 'sync' }" @click="activeSettingsTab = 'sync'">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M14 8A6 6 0 1 1 8 2c2.2 0 4.1 1.2 5.2 3M14 2v3.2h-3.2"/></svg>
            <span>同步备份</span>
          </button>
          <button class="settings-tab-btn" :class="{ active: activeSettingsTab === 'logs' }" @click="activeSettingsTab = 'logs'">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 2.5h7l3 3V13a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V4A1.5 1.5 0 0 1 3 2.5zM10 2.5V6h3M4.5 9h7M4.5 11.5h4.5"/></svg>
            <span>运行日志</span>
          </button>
          <button class="settings-tab-btn" :class="{ active: activeSettingsTab === 'about' }" @click="activeSettingsTab = 'about'">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 4.5h.01"/></svg>
            <span>关于更新</span>
          </button>
        </div>

        <!-- 右侧内容 -->
        <div class="settings-content">
          <!-- 基础配置 -->
          <SettingsBasic v-if="activeSettingsTab === 'basic'" v-model:appConfigForm="appConfigForm" />

          <!-- 窗口关闭偏好 -->
          <SettingsWindow
            v-if="activeSettingsTab === 'window'"
            v-model:appCloseBehavior="appCloseBehavior"
            v-model:killEnvsOnClose="killEnvsOnClose"
            v-model:killServerOnClose="appConfigForm.killServerOnClose"
          />

          <!-- 系统清理 -->
          <div v-if="activeSettingsTab === 'cleanup'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">全局系统安全清理</h4>
              <p class="settings-desc">安全强杀所有项目注册的本地端口与残留子进程，释放系统资源</p>
            </div>
            <div class="cleanup-action-card">
              <div class="cleanup-card-desc">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--color-warning, #f59e0b)" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11.5h.01"/></svg>
                <span>若遇到本地服务僵死、端口占用无法启动时，可执行一键回收强杀进程。</span>
              </div>
              <button class="btn-pill-secondary press-spring" :disabled="cleaningAllResources" @click="cleanAllResources">
                <svg v-if="cleaningAllResources" class="spin-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="10"/></svg>
                <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M14 8A6 6 0 1 1 8 2c2.2 0 4.1 1.2 5.2 3M14 2v3.2h-3.2"/></svg>
                <span>{{ cleaningAllResources ? '正在强制回收...' : '一键强制回收全部项目资源' }}</span>
              </button>
            </div>
          </div>

          <!-- 同步与备份 -->
          <SettingsSync
            v-if="activeSettingsTab === 'sync'"
            :closeOnOverlayClick="closeOnOverlayClick"
            @success="emit('success')"
            @close="hide"
            @message="msg => emit('message', msg)"
          />

          <!-- 运行日志 -->
          <div v-if="activeSettingsTab === 'logs'" class="animate-fade-in settings-section">
            <div class="settings-header">
              <h4 class="settings-title">运行日志</h4>
              <p class="settings-desc">管理并定位 OmniDev 服务引擎所产生的本地运行日志</p>
            </div>
            
            <div class="logs-manager-card">
              <div class="logs-card-header">
                <div class="header-icon-box brand">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 2.5h7l3 3V13a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V4A1.5 1.5 0 0 1 3 2.5zM10 2.5V6h3M4.5 9h7M4.5 11.5h4.5"/></svg>
                </div>
                <div class="logs-card-info">
                  <span class="logs-card-title">物理运行日志目录</span>
                  <span class="logs-card-desc">日志文件隔离存放在系统指定的本地 AppData 或运行根目录的 logs/ 文件夹下。</span>
                </div>
              </div>
              <p class="logs-help-text">
                当遇到 SSH 连接异常、服务被死锁占用、Git 构建冲突等故障排查场景时，建议打开本端日志以获取最完整的底噪及 stdout/stderr 输出。
              </p>
              <div style="margin-top: 14px;">
                <button class="btn-pill-secondary press-spring" :disabled="openingLogFolder" @click="openLogFolder">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h3.1a1.5 1.5 0 0 1 1.06.44l1.34 1.34a1.5 1.5 0 0 0 1.06.44H13A1.5 1.5 0 0 1 14.5 6v6.5a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5V4z"/></svg>
                  <span>{{ openingLogFolder ? '正在打开目录...' : '打开运行日志目录' }}</span>
                </button>
              </div>
            </div>

            <!-- 日志保留设置 -->
            <div class="logs-manager-card" style="margin-top: 14px;">
              <div class="logs-card-header">
                <div class="header-icon-box brand">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>
                </div>
                <div class="logs-card-info">
                  <span class="logs-card-title">历史日志保留规则</span>
                  <span class="logs-card-desc">设定本地运行日志文件的最长留存天数，超时将由控制台自动清理。</span>
                </div>
              </div>
              
              <div class="log-retention-setting" style="margin-top: 12px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span style="font-size: 13px; color: var(--text); font-weight: 500;">保留期限：</span>
                <select v-model="appConfigForm.logKeepType" class="form-control" style="width: 140px; font-size: 12px;">
                  <option value="3">3 天（默认）</option>
                  <option value="7">7 天</option>
                  <option value="15">15 天</option>
                  <option value="30">30 天</option>
                  <option value="custom">自定义天数</option>
                  <option value="never">不删除</option>
                </select>
                
                <div v-if="appConfigForm.logKeepType === 'custom'" style="display: flex; align-items: center; gap: 6px;">
                  <input 
                    type="number" 
                    v-model.number="appConfigForm.logKeepDaysCustom" 
                    min="1" 
                    max="365" 
                    class="form-control" 
                    style="width: 80px; text-align: center; font-size: 12px;"
                  />
                  <span style="font-size: 13px; color: var(--text);">天</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 关于与更新 -->
          <SettingsAbout
            v-if="activeSettingsTab === 'about'"
            v-model:appConfigForm="appConfigForm"
            :downloadingUpdate="downloadingUpdate"
            :downloadPercent="downloadPercent"
            :downloadStatus="downloadStatus"
            :downloadError="downloadError"
            :installingAndExiting="installingAndExiting"
            @download="updateInfo => emit('download', updateInfo)"
            @reset-download="emit('reset-download')"
          />
        </div>
      </div>

      <!-- 底部保存/取消操作栏，常驻以锁定高度与布局稳定性 -->
      <div class="modal-footer">
        <template v-if="activeSettingsTab === 'basic' || activeSettingsTab === 'window' || activeSettingsTab === 'about' || activeSettingsTab === 'logs'">
          <button class="btn-pill-secondary press-spring" @click="hide">取消</button>
          <button class="btn-pill-primary press-spring" :disabled="savingAppConfig" @click="saveSettings">
            <svg v-if="savingAppConfig" class="spin-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="10"/></svg>
            <span>{{ savingAppConfig ? '保存中...' : '保存配置' }}</span>
          </button>
        </template>
        <template v-else>
          <button class="btn-pill-secondary press-spring" @click="hide">关闭</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "./SettingsModal.css";
</style>
