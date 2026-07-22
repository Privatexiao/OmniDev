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
    <div class="glass-card modal-content animate-zoom" style="max-width: 420px; border: 1px solid rgba(99, 102, 241, 0.25);">
      <div class="modal-header">
        <h3>关闭 OmniDev</h3>
        <button class="btn-close" @click="hide">×</button>
      </div>
      <div class="modal-body" style="padding-top: 10px;">
        <span style="font-size: 14px; line-height: 1; color: var(--text); font-weight: 500;">
          选择关闭方式
        </span>
        <div class="options-group">
          <div 
            class="option-card" 
            :class="{ active: closeChoice === 'minimize' }"
            @click="closeChoice = 'minimize'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">最小化到系统托盘</span>
              <span class="option-desc">应用将在后台静默运行，可双击托盘图标重新唤醒</span>
            </div>
          </div>
          
          <div 
            class="option-card" 
            :class="{ active: closeChoice === 'close' }"
            @click="closeChoice = 'close'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">退出 OmniDev</span>
              <span class="option-desc">彻底关闭所有开发环境进程，释放系统资源</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 16px;">
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12.5px; user-select: none;">
          <input type="checkbox" v-model="rememberCloseChoice" style="cursor: pointer; accent-color: var(--primary); width: 14px; height: 14px;" />
          <span style="color: var(--text-muted, #71717a);">不再提示 (设置中可调)</span>
        </label>
        <div style="display: flex; gap: 10px;">
          <button class="btn-mini btn-mini-cancel" @click="hide">
            取消
          </button>
          <button class="btn-mini btn-mini-primary" @click="handleConfirm">
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.options-group {
  /* margin: 16px 0; */
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.08);
  background: rgba(99, 102, 241, 0.02);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.option-card:hover {
  border-color: rgba(99, 102, 241, 0.25);
  background: rgba(99, 102, 241, 0.05);
}

.option-card.active {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.09);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}

.radio-indicator {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(99, 102, 241, 0.3);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.option-card.active .radio-indicator {
  border-color: var(--primary);
}

.option-card.active .radio-indicator::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.option-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.option-desc {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

/* 兼容暗色/亮色主题 */
[data-theme="dark"] .option-desc {
  color: rgba(255, 255, 255, 0.45);
}
[data-theme="light"] .option-desc {
  color: rgba(0, 0, 0, 0.45);
}
</style>
