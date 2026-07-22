<script setup>
/**
 * @file PortOccupiedModal.vue
 * @description 端口冲突处理模态框，当控制台 3300 服务端口被占用时弹出，支持一键强杀占用进程或动态修改并切换到新端口
 */
import { ref, watch, computed } from 'vue'

const props = defineProps({
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['success', 'message'])

const visible = ref(false)
const occupiedPort = ref(3300)
const actionChoice = ref('kill') // 'kill' | 'change'
const newPort = ref(3301)
const processing = ref(false)

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
const show = (port) => {
  occupiedPort.value = Number(port) || 3300
  newPort.value = (Number(port) || 3300) + 1
  actionChoice.value = 'kill'
  processing.value = false
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

// 🚀 校验端口输入是否符合 TCP 规范
const isPortValid = computed(() => {
  const p = Number(newPort.value)
  return !isNaN(p) && p >= 1024 && p <= 65535
})

const handleConfirm = async () => {
  if (actionChoice.value === 'change' && !isPortValid.value) {
    emit('message', { text: '请输入合法的 TCP 端口号 (1024 ~ 65535)', type: 'error' })
    return
  }

  processing.value = true
  try {
    if (actionChoice.value === 'kill') {
      // 1. 调用 Rust 强杀命令
      await window.__TAURI__.core.invoke('kill_port_process', { port: occupiedPort.value })
      emit('message', { text: `已强杀占用的端口进程，正在重新启动服务...`, type: 'info' })
      
      // 2. 尝试重新启动 Node 后端
      const msg = await window.__TAURI__.core.invoke('start_backend_server')
      emit('message', { text: msg || '后端服务重启成功！', type: 'success' })
      emit('success')
      visible.value = false
    } else {
      // 3. 修改并保存全局配置
      const pVal = Number(newPort.value)
      await window.__TAURI__.core.invoke('save_server_port', { port: pVal })
      emit('message', { text: `全局端口已调整为 ${pVal}，正在以此端口重新启动服务...`, type: 'info' })
      
      // 4. 尝试以新端口重新启动 Node 后端
      const msg = await window.__TAURI__.core.invoke('start_backend_server')
      emit('message', { text: msg || '后端服务在新端口拉起成功！', type: 'success' })
      emit('success')
      visible.value = false
    }
  } catch (err) {
    console.error('端口冲突处理失败:', err)
    emit('message', { text: '处理端口冲突失败: ' + (err || '未知错误'), type: 'error' })
  } finally {
    processing.value = false
  }
}

defineExpose({
  show,
  hide,
  visible
})
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleOverlayClick">
    <div class="glass-card modal-content animate-zoom" style="max-width: 440px; border: 1px solid rgba(239, 68, 68, 0.3);">
      <div class="modal-header">
        <h3 class="title-warning">⚠️ 端口冲突警告</h3>
        <button class="btn-close" @click="hide" :disabled="processing">×</button>
      </div>
      <div class="modal-body" style="padding-top: 10px;">
        <p class="modal-intro-text">
          系统主控服务默认端口 <strong class="highlight-port">{{ occupiedPort }}</strong> 已被占用，导致 Node 后端引擎无法拉起。请选择处理方案：
        </p>
        
        <div class="options-group">
          <!-- 强杀端口选项 -->
          <div 
            class="option-card" 
            :class="{ active: actionChoice === 'kill' }"
            @click="actionChoice = 'kill'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">强杀占用进程并重新启动</span>
              <span class="option-desc">强力终结当前占用该端口的所有本地后台进程，释放资源后原地重启</span>
            </div>
          </div>
          
          <!-- 替换端口选项 -->
          <div 
            class="option-card" 
            :class="{ active: actionChoice === 'change' }"
            @click="actionChoice = 'change'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">修改为新端口再启动</span>
              <span class="option-desc">修改全局端口配置映射，避开冲突端口，改用新端口拉起引擎</span>
            </div>
          </div>
        </div>

        <!-- 替换端口输入框（仅在选择修改时展示） -->
        <transition name="slide-fade">
          <div class="input-container" v-if="actionChoice === 'change'">
            <div class="port-input-wrapper">
              <label for="port-input-field">设定新服务端口：</label>
              <div class="input-with-suggest">
                <input 
                  id="port-input-field"
                  type="number" 
                  v-model.number="newPort" 
                  min="1024" 
                  max="65535"
                  :disabled="processing"
                  placeholder="请输入端口"
                  class="port-input-field"
                />
                <span class="suggest-badge" @click="newPort = occupiedPort + 1">
                  建议: {{ occupiedPort + 1 }}
                </span>
              </div>
            </div>
            <p class="helper-text">
              此修改会同步调整“系统设置”与全局 `app.json` 配置的端口映射。
            </p>
          </div>
        </transition>
      </div>

      <div class="modal-footer" style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 16px;">
        <button class="btn-mini btn-mini-cancel" @click="hide" :disabled="processing">
          取消
        </button>
        <button 
          class="btn-mini btn-mini-primary btn-run" 
          @click="handleConfirm" 
          :disabled="processing || (actionChoice === 'change' && !isPortValid)"
        >
          {{ processing ? '⏳ 处理中...' : '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-warning {
  color: #ef4444;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
}

.modal-intro-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  margin-bottom: 12px;
  text-align: left;
}

.highlight-port {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.options-group {
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
  border: 1px solid rgba(239, 68, 68, 0.08);
  background: rgba(239, 68, 68, 0.02);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.option-card:hover {
  border-color: rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.05);
}

.option-card.active {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.09);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.08);
}

.radio-indicator {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(239, 68, 68, 0.3);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.option-card.active .radio-indicator {
  border-color: #ef4444;
}

.option-card.active .radio-indicator::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
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

/* 设定新端口排版 */
.input-container {
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed rgba(0, 0, 0, 0.08);
  text-align: left;
}

[data-theme="dark"] .input-container {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.08);
}

.port-input-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.port-input-wrapper label {
  font-size: 12.5px;
  color: var(--text);
  font-weight: 500;
}

.input-with-suggest {
  display: flex;
  align-items: center;
  gap: 8px;
}

.port-input-field {
  width: 90px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: #ffffff;
  color: #000000;
  font-size: 13px;
  font-weight: 700;
  outline: none;
  font-family: monospace;
}

[data-theme="dark"] .port-input-field {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(30, 41, 59, 0.8);
  color: #ffffff;
}

.port-input-field:focus {
  border-color: #ef4444;
}

.suggest-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  transition: all 0.2s ease;
}

.suggest-badge:hover {
  background: #6366f1;
  color: #ffffff;
}

.helper-text {
  font-size: 10.5px;
  color: var(--text-muted, #71717a);
  margin-top: 6px;
  line-height: 1.3;
}

.btn-run {
  background: #ef4444 !important;
  color: #ffffff !important;
  border: 1px solid #ef4444 !important;
}

.btn-run:hover {
  background: #dc2626 !important;
  border-color: #dc2626 !important;
}

.btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 动效过渡 */
.slide-fade-enter-active {
  transition: all 0.25s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}

[data-theme="dark"] .option-desc {
  color: rgba(255, 255, 255, 0.45);
}
[data-theme="light"] .option-desc {
  color: rgba(0, 0, 0, 0.45);
}
</style>
