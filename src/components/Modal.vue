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
              <span class="modal-title">
                <slot name="title">🌿 {{ title }}</slot>
              </span>
              <button class="btn-close" @click="handleCancel" title="关闭">&times;</button>
            </div>
            
            <!-- 2. 中间主体默认插槽 -->
            <div class="modal-body">
              <slot></slot>
            </div>
            
            <!-- 3. 底部操作栏插槽 -->
            <div class="modal-footer" v-if="showFooter">
              <slot name="footer">
                <button class="btn btn-secondary" @click="handleCancel">取消</button>
                <button class="btn btn-primary" @click="handleConfirm">确定</button>
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
  background: rgba(15, 23, 42, 0.25);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
}

:global([data-theme="dark"] .modal-backdrop) {
  background: rgba(0, 0, 0, 0.45);
}

.modal-container {
  width: 620px;
  max-width: 90%;
  max-height: 90vh; /* 🚀 限制最大高度为视口高度的 90%，防超屏裁剪 */
  padding: 0;
  display: flex;
  flex-direction: column;
  border: var(--border);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.98);
  overflow: hidden; /* 🚀 配合 flex 子元素滚动 */
  border-radius: 16px;
}

:global([data-theme="dark"] .modal-container) {
  background: rgba(30, 41, 59, 0.98);
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem 0.75rem 1.5rem;
}

.modal-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--card-name);
  letter-spacing: -0.3px;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.6rem;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  transition: all 0.2s;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-close:hover {
  color: var(--text);
  transform: scale(1.15);
}

.modal-body {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  flex: 1; /* 🚀 占用全部剩余高度空间 */
  overflow-y: auto; /* 🚀 当内容高出窗口限制时显示漂亮的纵向滚动条 */
  padding: 0 1.5rem 1.25rem 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 1rem 1.5rem;
  background: rgba(0, 0, 0, 0.02);
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

:global([data-theme="dark"] .modal-footer) {
  background: rgba(255, 255, 255, 0.01);
  border-top-color: rgba(255, 255, 255, 0.04);
}

.modal-footer .btn {
  padding: 8px 16px;
  font-size: 0.8rem;
  border-radius: 8px;
  min-width: 70px;
}

/* 过渡动效系统 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.zoom-enter-active, .zoom-leave-active {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}
.zoom-enter-from, .zoom-leave-to {
  transform: scale(0.92) translateY(8px);
  opacity: 0;
}
</style>
