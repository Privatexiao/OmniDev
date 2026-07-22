<script setup>
/**
 * @file SettingsAbout.vue
 * @description 系统设置“关于与更新”子面板，展示应用基本信息、提供手动/自动检查更新配置以及实时渲染包下载进度条
 */
import { ref, shallowRef, watch, onMounted, computed } from 'vue'

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
  'download'
])

const localForm = ref({ ...props.appConfigForm })

watch(() => props.appConfigForm, (newVal) => {
  localForm.value = { ...newVal }
}, { deep: true })

watch(localForm, (newVal) => {
  emit('update:appConfigForm', newVal)
}, { deep: true })

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
    ? '⬆️ 查看并确认重大版本更新'
    : '⚡ 应用内更新并重启'
})

const manualCheckUpdate = async () => {
  checkingUpdate.value = true
  updateResult.value = null
  try {
    const url = `/api/system/check-update?updateUrl=${encodeURIComponent(localForm.value.updateUrl || '')}`
    const res = await fetch(url)
    const data = await res.json()
    updateResult.value = data
    currentVersion.value = data.currentVersion || '--'
  } catch (err) {
    updateResult.value = {
      success: true,
      currentVersion: '--',
      latestVersion: '--',
      hasUpdate: false,
      changelog: '无法连接更新服务器。'
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
      <h4 class="settings-title">ℹ️ 关于与更新</h4>
      <p class="settings-desc">查看 OmniDev 版本信息及检查更新设置</p>
    </div>

    <div class="about-brand-card" style="background: rgba(255, 255, 255, 0.4); border: 1px solid rgba(120, 120, 120, 0.15); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
      <div class="brand-logo-area" style="display: flex; align-items: center; gap: 12px;">
        <span class="brand-logo" style="font-size: 2.2rem;">🚀</span>
        <div class="brand-info" style="display: flex; flex-direction: column;">
          <span class="brand-name" style="font-size: 15px; font-weight: 800;">OmniDev 控制台</span>
          <span class="brand-version" style="font-size: 11px; color: var(--text-muted);">当前版本: v{{ currentVersion }}</span>
        </div>
      </div>
      <p class="brand-desc" style="font-size: 12px; color: var(--text-muted); margin: 6px 0 0 0; line-height: 1.5;">
        多环境一键启停与快捷同源免密登录开发者大盘控制台。
      </p>
    </div>

    <div class="form-group" style="margin-top: 16px; margin-bottom: 16px;">
      <label class="checkbox-label" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
        <input type="checkbox" v-model="localForm.autoCheckUpdate" />
        <span>启动软件时自动检查更新</span>
      </label>
    </div>

    <div class="update-action-row" style="margin-top: 16px; display: flex; gap: 8px;">
      <button class="btn-mini btn-mini-primary check-update-btn" :disabled="checkingUpdate" @click="manualCheckUpdate">
        {{ checkingUpdate ? '正在检查...' : '🔍 立即检查更新' }}
      </button>
    </div>

    <!-- 检查更新结果 -->
    <div v-if="updateResult" class="update-result-card animate-fade-in" style="margin-top: 16px; background: rgba(0, 0, 0, 0.03); border: 1px solid rgba(120, 120, 120, 0.1); border-radius: 8px; padding: 14px;">
      <div v-if="updateResult.hasUpdate" class="update-found">
        <div class="update-found-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <span class="update-badge" style="background: #ef4444; color: #ffffff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px;">NEW</span>
          <span class="update-title" style="font-size: 13px; font-weight: 700;">发现新版本 v{{ updateResult.latestVersion }} !</span>
          <span class="update-mode-badge">
            {{ updateResult.updateMode === 'manual' ? '重大版本' : '应用内更新' }}
          </span>
        </div>
        <div class="changelog-area" style="margin-bottom: 12px;">
          <h5 style="margin: 0 0 6px 0; font-size: 12px;">📝 更新日志：</h5>
          <pre style="margin: 0; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11.5px; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto;">{{ updateResult.changelog }}</pre>
        </div>
        
        <!-- 下载进度条 -->
        <div class="download-progress-container" v-if="downloadingUpdate || downloadStatus === 'error'" style="background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.1); border-radius: 6px; padding: 10px; margin-top: 8px;">
          <div class="progress-bar-wrapper" style="height: 6px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden; width: 100%;">
            <div class="progress-bar-fill" :style="{ width: downloadPercent + '%', height: '100%', background: '#6366f1', transition: 'width 0.3s' }"></div>
          </div>
          <div class="progress-status-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
            <span class="progress-percent" style="margin: 0; font-size: 11px; font-weight: 600;">
              {{ progressText }}
            </span>
          </div>
        </div>
        <button
          v-else
          class="btn-mini btn-mini-primary download-update-btn"
          :disabled="!updateResult.signatureAvailable || installingAndExiting"
          :title="updateResult.signatureAvailable ? '' : '更新源缺少 Tauri 签名'"
          @click="emit('download', updateResult)"
        >
          {{ updateActionText }}
        </button>
        <p v-if="!updateResult.signatureAvailable" class="update-signature-warning">
          更新源未提供有效签名，已禁止下载和执行。
        </p>
      </div>
      <div v-else class="update-not-found">
        <p class="update-success-msg" style="margin: 0; font-size: 12px; color: #10b981; font-weight: 600;">🎉 当前已是最新版本 (v{{ updateResult.currentVersion }})，无需更新。</p>
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
</style>
