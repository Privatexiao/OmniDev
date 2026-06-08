<script setup>

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close'])

const getIcon = (type) => {
  switch (type) {
    case 'success': return '⚡'
    case 'error': return '⚠️'
    case 'warning': return '🔔'
    default: return '💡'
  }
}

const remove = (id) => {
  emit('close', id)
}
</script>

<template>
  <div class="message-container">
    <TransitionGroup name="msg-animate">
      <div 
        v-for="msg in messages" 
        :key="msg.id" 
        class="message-toast animate-toast" 
        :class="msg.type || 'info'"
      >
        <div class="msg-glow"></div>
        <span class="msg-icon">{{ getIcon(msg.type) }}</span>
        <div class="msg-content">
          <p class="msg-text">{{ msg.text }}</p>
        </div>
        <button class="msg-btn-close" @click="remove(msg.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.message-container {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
  max-width: 480px;
  width: calc(100% - 32px);
}

.message-toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  pointer-events: auto;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .message-toast {
  background: rgba(15, 23, 42, 0.85);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

/* 各类型特有的拟物偏色与呼吸发光 */
.message-toast.success {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.1);
}
.message-toast.success .msg-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.message-toast.error {
  border-color: rgba(239, 68, 68, 0.3);
  box-shadow: 0 8px 24px rgba(239, 68, 68, 0.1);
}
.message-toast.error .msg-icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.message-toast.warning {
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.1);
}
.message-toast.warning .msg-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.message-toast.info {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.1);
}
.message-toast.info .msg-icon {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

/* 图标修饰 */
.msg-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: bold;
  flex-shrink: 0;
}

/* 内容布局 */
.msg-content {
  flex-grow: 1;
  padding-top: 2px;
}

.msg-text {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.4;
  white-space: pre-wrap;
}

/* 关闭按钮 */
.msg-btn-close {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  margin: 0;
  line-height: 1;
  transition: color 0.15s ease;
  outline: none;
  flex-shrink: 0;
  margin-top: 1px;
}

.msg-btn-close:hover {
  color: var(--text);
}

/* 🚀 物理淡入淡出滑动过渡动画 */
.msg-animate-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}
.msg-animate-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.msg-animate-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.msg-animate-leave-to {
  opacity: 0;
  transform: translateY(-15px) scale(0.92);
}
.msg-animate-leave-active {
  position: absolute;
}
</style>
