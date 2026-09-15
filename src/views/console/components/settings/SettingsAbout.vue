<script setup>
/**
 * @file SettingsAbout.vue
 * @description 系统设置“关于与更新”子面板，展示应用基本信息、提供手动/自动检查更新配置以及实时渲染包下载进度条
 */
import { ref, shallowRef, onMounted, computed } from 'vue'

const props = defineProps({
  appConfigForm: {
    type: Object,
    required: true
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
  }
})

const emit = defineEmits([
  'update:appConfigForm',
  'download',
  'reset-download'
])

const handleRetry = () => {
  emit('reset-download')
  emit('download', updateResult.value)
}

const updateAutoCheck = (event) => {
  emit('update:appConfigForm', {
    ...props.appConfigForm,
    autoCheckUpdate: event.target.checked
  })
}

const checkingUpdate = shallowRef(false)
const updateResult = ref(null)
const currentVersion = shallowRef('--')

const progressText = computed(() => {
  if (props.downloadStatus === 'installing') return '签名校验通过，正在安装更新...'
  if (props.downloadStatus === 'completed') return '更新已安装，正在重启...'
  if (props.downloadStatus === 'error') return `更新失败：${props.downloadError || '未知错误'}`
  return `正在应用内下载签名更新: ${props.downloadPercent}%`
})

const updateActionText = computed(() => {
  return updateResult.value?.updateMode === 'manual'
    ? '查看并确认重大版本更新'
    : '应用内更新并重启'
})

const updateErrorText = computed(() => {
  return updateResult.value?.error || '无法连接更新服务器，请检查网络后重试。'
})

const manualCheckUpdate = async () => {
  emit('reset-download')
  checkingUpdate.value = true
  updateResult.value = null
  try {
    const url = `/api/system/check-update?updateUrl=${encodeURIComponent(props.appConfigForm.updateUrl || '')}`
    const res = await fetch(url)
    const data = await res.json()
    updateResult.value = data
    currentVersion.value = data.currentVersion || '--'
  } catch (err) {
    updateResult.value = {
      success: false,
      currentVersion: '--',
      latestVersion: null,
      hasUpdate: false,
      error: '更新检查请求失败，请确认本地服务和网络连接正常。'
    }
  } finally {
    checkingUpdate.value = false
  }
}

onMounted(() => {
  manualCheckUpdate()
})
</script>

<template>
  <div class="animate-fade-in settings-section">
    <div class="settings-header">
      <h4 class="settings-title">关于与更新</h4>
      <p class="settings-desc">查看 OmniDev 版本信息及检查更新设置</p>
    </div>

    <div class="about-brand-card">
      <div class="brand-logo-area">
        <div class="header-icon-box brand" style="width: 44px; height: 44px; border-radius: 12px;">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4.5c1.62-1.63 5-2 5-2"/>
            <path d="M12 9V4s3.03.55 4.5 2c1.63 1.62 2 5 2 5"/>
          </svg>
        </div>
        <div class="brand-info">
          <span class="brand-name">OmniDev 控制台</span>
          <span class="brand-version">当前版本: v{{ currentVersion }}</span>
        </div>
      </div>
      <p class="brand-desc">
        多环境一键启停与快捷同源免密登录开发者大盘控制台。
      </p>
    </div>

    <div class="form-group" style="margin-top: 16px; margin-bottom: 16px;">
      <label class="checkbox-label">
        <input type="checkbox" :checked="appConfigForm.autoCheckUpdate" @change="updateAutoCheck" />
        <span>启动软件时自动检查更新</span>
      </label>
    </div>

    <div class="update-action-row" style="margin-top: 14px; display: flex; gap: 8px;">
      <button class="btn-pill-secondary press-spring check-update-btn" :disabled="checkingUpdate" @click="manualCheckUpdate">
        <svg v-if="checkingUpdate" class="spin-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6" stroke-dasharray="28" stroke-dashoffset="10"/></svg>
        <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
        <span>{{ checkingUpdate ? '正在检查...' : '检查更新' }}</span>
      </button>
    </div>

    <!-- 检查更新结果 -->
    <div v-if="updateResult" class="update-result-card animate-fade-in" style="margin-top: 16px;">
      <div v-if="updateResult.success === false" class="update-check-error">
        <div style="display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--color-danger, #ef4444)" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 11.5h.01"/></svg>
          <p class="update-error-title">更新检查未完成</p>
        </div>
        <p class="update-error-detail">{{ updateErrorText }}</p>
      </div>
      <div v-else-if="updateResult.hasUpdate" class="update-found">
        <div class="update-found-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <span class="update-badge">NEW</span>
          <span class="update-title">发现新版本 v{{ updateResult.latestVersion }}</span>
          <span class="update-mode-badge">
            {{ updateResult.updateMode === 'manual' ? '重大版本' : '应用内更新' }}
          </span>
        </div>
        <div class="changelog-area" style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 6px 0; font-size: 12px; color: var(--text);">更新日志</h5>
          <pre>{{ updateResult.changelog }}</pre>
        </div>
        
        <!-- 下载进度条 -->
        <div class="download-progress-container" v-if="downloadingUpdate || downloadStatus === 'error'">
          <div class="progress-bar-wrapper">
            <div class="progress-bar-fill" :class="{ 'is-error': downloadStatus === 'error' }" :style="{ width: (downloadStatus === 'error' ? 100 : downloadPercent) + '%' }"></div>
          </div>
          <div class="progress-status-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px;">
            <span class="progress-percent" :style="{ color: downloadStatus === 'error' ? '#ef4444' : 'inherit' }">
              {{ progressText }}
            </span>
            <button
              v-if="downloadStatus === 'error'"
              class="btn-pill-primary press-spring"
              style="padding: 4px 14px; font-size: 11px; height: 26px; border-radius: 9999px; flex-shrink: 0;"
              @click="handleRetry"
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 8a7 7 0 1 1 2 4.9M1 13V8h5"/></svg>
              <span>重试更新</span>
            </button>
          </div>
        </div>
        <button
          v-else
          class="btn-pill-primary press-spring download-update-btn"
          :disabled="!updateResult.signatureAvailable || installingAndExiting"
          :title="updateResult.signatureAvailable ? '' : '更新源缺少 Tauri 签名'"
          @click="emit('download', updateResult)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2.5v9M4 7.5l4-4 4 4M2 13.5h12"/></svg>
          <span>{{ updateActionText }}</span>
        </button>
        <p v-if="!updateResult.signatureAvailable" class="update-signature-warning">
          更新源未提供有效签名，已禁止下载和执行。
        </p>
      </div>
      <div v-else class="update-not-found" style="display: flex; align-items: center; gap: 8px;">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--color-success, #10b981)" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><polyline points="5 8 7 10 11 6"/></svg>
        <p class="update-success-msg" style="margin: 0; font-size: 12px; color: #10b981; font-weight: 600;">当前已是最新版本 (v{{ updateResult.currentVersion }})，无需更新。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "./SettingsModal.css";

.update-mode-badge {
  margin-left: auto;
  color: #6366f1;
  font-size: 10px;
  font-weight: 700;
}

.update-signature-warning {
  margin: 8px 0 0;
  color: #ef4444;
  font-size: 11px;
  line-height: 1.5;
}

.update-error-title {
  margin: 0;
  color: #ef4444;
  font-size: 12px;
  font-weight: 700;
}

.update-error-detail {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}
</style>
