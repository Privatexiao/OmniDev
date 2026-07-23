<script setup>
/**
 * @file AppUpdater.vue
 * @description 应用更新提示与重大版本更新确认组件
 */
import { ref, watch, nextTick, computed } from 'vue'
import Modal from '../../../components/Modal.vue'

const props = defineProps({
  showUpdateBanner: {
    type: Boolean,
    default: false
  },
  latestUpdateInfo: {
    type: Object,
    default: null
  },
  showInstallConfirm: {
    type: Boolean,
    default: false
  },
  installingAndExiting: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:showUpdateBanner',
  'update:showInstallConfirm',
  'viewUpdate',
  'confirmInstall'
])

const installModalRef = ref(null)
const modalTitle = computed(() => `重大版本 v${props.latestUpdateInfo?.latestVersion || ''} 更新确认`)

// 监听安装弹窗状态，同步控制 Modal 组件的显隐
watch(() => props.showInstallConfirm, (newVal) => {
  if (newVal) {
    nextTick(() => {
      installModalRef.value?.show()
    })
  } else {
    installModalRef.value?.hide()
  }
})

const handleIgnoreUpdate = () => {
  if (props.latestUpdateInfo) {
    localStorage.setItem('omnidev_ignored_version', props.latestUpdateInfo.latestVersion)
  }
  emit('update:showUpdateBanner', false)
}

const handleViewUpdate = () => {
  emit('update:showUpdateBanner', false)
  emit('viewUpdate')
}

const handleInstallCancel = () => {
  emit('update:showInstallConfirm', false)
  installModalRef.value?.hide()
}

const handleConfirmInstall = () => {
  emit('confirmInstall')
}

defineExpose({
  installModalRef
})
</script>

<template>
  <!-- 🚀 右下角新版本更新悬浮气泡 -->
  <div class="update-banner glass-card animate-slide-in" v-if="showUpdateBanner">
    <div class="update-banner-header">
      <span class="update-banner-icon">🚀</span>
      <span class="update-banner-title">发现新版本 v{{ latestUpdateInfo?.latestVersion }}</span>
      <button class="update-banner-close" @click="emit('update:showUpdateBanner', false)">×</button>
    </div>
    <div class="update-banner-body">
      <p class="update-banner-desc">OmniDev 发布了新版本，可在应用内完成签名更新。</p>
    </div>
    <div class="update-banner-footer">
      <button class="btn-mini btn-mini-cancel" @click="handleIgnoreUpdate">忽略此版本</button>
      <button class="btn-mini btn-mini-primary" @click="handleViewUpdate">查看更新</button>
    </div>
  </div>

  <!-- ⬆️ 重大版本更新确认弹窗 -->
  <Modal 
    ref="installModalRef" 
    :title="modalTitle"
    :showFooter="true"
    @confirm="handleConfirmInstall"
    @cancel="handleInstallCancel"
  >
    <div class="install-confirm-body">
      <p class="install-confirm-intro">
        此版本被标记为重大更新，可能包含原生能力、配置或兼容性变更。
      </p>

      <!-- ⚠️ 关键提示 -->
      <div class="install-warning-card">
        <div class="install-warning-title">
          <span>⚠️ 关键提示</span>
        </div>
        <div class="install-warning-text">
          <span>点击确认后，Tauri 将校验更新签名并以被动模式安装。</span>
          <strong>应用会自动关闭 Node 服务、释放端口并重启，请先保存未完成的操作。</strong>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="install-footer-actions">
        <button class="btn-mini btn-mini-cancel" @click="handleInstallCancel">稍后更新</button>
        <button 
          class="btn-mini btn-mini-primary install-primary-action" 
          :disabled="installingAndExiting" 
          @click="handleConfirmInstall"
        >
          {{ installingAndExiting ? '正在更新...' : '✅ 确认更新并重启' }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.update-banner {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1001;
  width: 320px;
  padding: 16px;
  border: 1px solid rgba(99, 102, 241, 0.22);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.75);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

:global([data-theme="light"] .update-banner) {
  border-color: rgba(99, 102, 241, 0.2);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.12), 0 8px 10px -6px rgba(99, 102, 241, 0.12);
}

.update-banner-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.update-banner-icon {
  font-size: 18px;
}

.update-banner-title {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, #a5b4fc, #818cf8);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

:global([data-theme="light"] .update-banner-title) {
  background: linear-gradient(135deg, var(--primary), #818cf8);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.update-banner-close {
  position: absolute;
  top: -4px;
  right: -4px;
  padding: 4px;
  border: 0;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  background: transparent;
  cursor: pointer;
}

.update-banner-close:hover {
  color: var(--text);
}

.update-banner-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.5;
}

.update-banner-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.animate-slide-in {
  animation: slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.install-confirm-body {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  color: var(--text);
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.install-confirm-intro {
  font-size: 13.5px;
  line-height: 1.6;
  margin: 0;
  color: var(--text-muted);
}

.install-warning-card {
  background: rgba(239, 68, 68, 0.08);
  border-left: 4px solid #ef4444;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.install-warning-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ef4444;
  font-size: 13px;
  font-weight: 700;
}

.install-warning-text {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 6px;
  word-break: break-word;
}

.install-warning-text strong {
  color: #ef4444;
  font-weight: 700;
}

.install-footer-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.install-primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 6px;
}

@media (max-width: 560px) {
  .install-footer-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
