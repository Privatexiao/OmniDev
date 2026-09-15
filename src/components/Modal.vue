<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '提示'
  },
  showFooter: {
    type: Boolean,
    default: true
  },
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const visible = ref(false)

const show = () => {
  visible.value = true
}

const hide = () => {
  visible.value = false
}

const handleConfirm = () => {
  emit('confirm')
}

const handleCancel = () => {
  emit('cancel')
  hide()
}

const handleBackdropClick = () => {
  if (props.closeOnOverlayClick) {
    handleCancel()
  }
}

// 暴露通用的打开和关闭底层接口
defineExpose({
  show,
  hide
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="modal-backdrop" v-if="visible" @click.self="handleBackdropClick">
        <Transition name="zoom">
          <div class="modal-container glass-card" v-if="visible">
            <!-- 1. 头部标题区插槽 -->
            <div class="modal-header">
              <div class="header-left">
                <slot name="icon">
                  <div class="header-icon-box brand">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                  </div>
                </slot>
                <div class="header-title-wrap">
                  <span class="modal-title">
                    <slot name="title">{{ title }}</slot>
                  </span>
                  <slot name="subtitle"></slot>
                </div>
              </div>
              <button class="btn-close press-spring" @click="handleCancel" title="关闭">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <!-- 2. 中间主体默认插槽 -->
            <div class="modal-body">
              <slot></slot>
            </div>
            
            <!-- 3. 底部操作栏插槽 -->
            <div class="modal-footer" v-if="showFooter">
              <slot name="footer">
                <button class="btn-pill-secondary press-spring" @click="handleCancel">取消</button>
                <button class="btn-pill-primary press-spring" @click="handleConfirm">确定</button>
              </slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
}

:global([data-theme="dark"] .modal-backdrop) {
  background: rgba(0, 0, 0, 0.55);
}

.modal-container {
  width: 540px;
  max-width: 92%;
  max-height: 90vh;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-card, 20px);
  background: var(--panel-bg, #ffffff);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

:global([data-theme="dark"] .modal-container) {
  background: #1c1d24;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 22px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

:global([data-theme="dark"] .modal-header) {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-icon-box.brand {
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
}
:global([data-theme="dark"] .header-icon-box.brand) {
  background: rgba(41, 151, 255, 0.15);
  color: #2997ff;
}

.header-title-wrap {
  display: flex;
  flex-direction: column;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 650;
  color: var(--text);
  letter-spacing: var(--tracking-title, -0.022em);
}

.btn-close {
  background: rgba(0, 0, 0, 0.04);
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  outline: none;
}

:global([data-theme="dark"] .btn-close) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.btn-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}

:global([data-theme="dark"] .btn-close:hover) {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.modal-body {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 13px 22px;
  background: rgba(0, 0, 0, 0.015);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

:global([data-theme="dark"] .modal-footer) {
  background: rgba(255, 255, 255, 0.015);
  border-top-color: rgba(255, 255, 255, 0.05);
}

/* 过渡动效系统 (高质感 柔和弹性与微下落) */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.22s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.zoom-enter-active, .zoom-leave-active {
  transition: transform 0.24s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.22s ease;
}
.zoom-enter-from, .zoom-leave-to {
  transform: scale(0.94);
  opacity: 0;
}
</style>
