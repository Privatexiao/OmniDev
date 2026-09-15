<script setup>
/**
 * @file CloseConfirmModal.vue
 * @description 客户端关闭确认弹窗，提供最小化至系统托盘或彻底退出系统的选项，并支持记住关闭偏好设置
 */
import { ref, watch } from 'vue'

const props = defineProps({
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm'])

const visible = ref(false)
const rememberCloseChoice = ref(false)
const closeChoice = ref('minimize') // 🚀 默认关闭方式为最小化

// 🚀 滚动穿透自适应锁定机制
watch(visible, (isOpen) => {
  if (typeof document !== 'undefined') {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }
})

// 🚀 暴露标准 show 方法以被父页面激活
const show = () => {
  closeChoice.value = 'minimize'
  rememberCloseChoice.value = false
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

// 🚀 抛出用户选择的选择及“是否记住”状态
const confirm = (choice) => {
  visible.value = false
  emit('confirm', { choice, remember: rememberCloseChoice.value })
}

const handleConfirm = () => {
  confirm(closeChoice.value)
}

defineExpose({
  show,
  hide,
  visible
})
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleOverlayClick">
    <div class="glass-card modal-content animate-zoom close-confirm-modal">
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-box brand">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </div>
          <div class="header-title-wrap">
            <h3 class="modal-title">关闭 OmniDev</h3>
            <p class="modal-desc">请选择应用退出方式与后台策略</p>
          </div>
        </div>
        <button class="btn-close press-spring" @click="hide" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="options-group">
          <div 
            class="option-card press-spring" 
            :class="{ active: closeChoice === 'minimize' }"
            @click="closeChoice = 'minimize'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">最小化到系统托盘 (推荐)</span>
              <span class="option-desc">应用将在后台持续保持服务监听，双击托盘图标可秒级唤醒</span>
            </div>
          </div>
          
          <div 
            class="option-card press-spring" 
            :class="{ active: closeChoice === 'close' }"
            @click="closeChoice = 'close'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">彻底退出应用程序</span>
              <span class="option-desc">终止全部后台守护进程并释放物理端口与系统内存资源</span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer footer-between">
        <label class="form-checkbox-label" title="记住选择">
          <input type="checkbox" v-model="rememberCloseChoice" class="form-checkbox" />
          <span class="checkbox-box mini">
            <svg class="check-icon" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="checkbox-subtext">不再提示 (可在设置中修改)</span>
        </label>
        <div class="footer-actions">
          <button class="btn-pill-secondary press-spring" @click="hide">
            取消
          </button>
          <button class="btn-pill-primary press-spring" @click="handleConfirm">
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.close-confirm-modal {
  max-width: 440px !important;
}

.options-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
  cursor: pointer;
  user-select: none;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .option-card {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.06);
}

.option-card:hover {
  border-color: rgba(0, 102, 204, 0.25);
  background: rgba(0, 102, 204, 0.03);
}

.option-card.active {
  border-color: var(--color-brand, #0066cc);
  background: rgba(0, 102, 204, 0.06);
  box-shadow: 0 2px 8px rgba(0, 102, 204, 0.08);
}

[data-theme="dark"] .option-card.active {
  border-color: #2997ff;
  background: rgba(41, 151, 255, 0.12);
}

.radio-indicator {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.25);
  transition: all 0.18s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

[data-theme="dark"] .radio-indicator {
  border-color: rgba(255, 255, 255, 0.3);
}

.option-card.active .radio-indicator {
  border-color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .option-card.active .radio-indicator {
  border-color: #2997ff;
}

.option-card.active .radio-indicator::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-brand, #0066cc);
}

[data-theme="dark"] .option-card.active .radio-indicator::after {
  background: #2997ff;
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.option-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.option-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}

.footer-between {
  display: flex;
  align-items: center;
  justify-content: space-between !important;
}

.checkbox-subtext {
  font-size: 11.5px;
  color: var(--text-muted);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
