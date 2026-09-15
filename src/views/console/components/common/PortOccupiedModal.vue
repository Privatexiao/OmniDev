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
    <div class="glass-card modal-content animate-zoom port-conflict-modal">
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-box warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div class="header-title-wrap">
            <h3 class="modal-title">服务端口冲突检测</h3>
            <p class="modal-desc">核心服务端口已被其他进程占用</p>
          </div>
        </div>
        <button class="btn-close press-spring" @click="hide" :disabled="processing" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="callout-card conflict-callout">
          <svg class="callout-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div class="callout-text">
            系统控制台后端默认端口 <strong class="highlight-port">{{ occupiedPort }}</strong> 正被外部进程占用。请选择恢复策略：
          </div>
        </div>
        
        <div class="options-group">
          <!-- 强杀端口选项 -->
          <div 
            class="option-card press-spring" 
            :class="{ active: actionChoice === 'kill' }"
            @click="actionChoice = 'kill'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">强力释放端口并原地重启</span>
              <span class="option-desc">终止当前占用该端口的后台残留进程，释放后立即在原端口拉起服务</span>
            </div>
          </div>
          
          <!-- 替换端口选项 -->
          <div 
            class="option-card press-spring" 
            :class="{ active: actionChoice === 'change' }"
            @click="actionChoice = 'change'"
          >
            <div class="radio-indicator"></div>
            <div class="option-text">
              <span class="option-title">变更服务端口并重新启动</span>
              <span class="option-desc">修改全局端口映射与配置，避开冲突端口在新端口启动核心引擎</span>
            </div>
          </div>
        </div>

        <!-- 替换端口输入框（仅在选择修改时展示） -->
        <transition name="slide-fade">
          <div class="input-container" v-if="actionChoice === 'change'">
            <div class="port-input-wrapper">
              <label class="form-label" for="port-input-field">设定新服务端口：</label>
              <div class="input-with-suggest">
                <input 
                  id="port-input-field"
                  type="number" 
                  v-model.number="newPort" 
                  min="1024" 
                  max="65535"
                  :disabled="processing"
                  placeholder="端口号"
                  class="form-control port-input-field"
                />
                <button type="button" class="suggest-pill press-spring" @click="newPort = occupiedPort + 1">
                  推荐 {{ occupiedPort + 1 }}
                </button>
              </div>
            </div>
            <p class="form-help">
              确认后将自动更新主系统设置及底层 app.json 端口配置文件。
            </p>
          </div>
        </transition>
      </div>

      <div class="modal-footer">
        <button class="btn-pill-secondary press-spring" @click="hide" :disabled="processing">
          取消
        </button>
        <button 
          class="btn-pill-danger press-spring" 
          @click="handleConfirm" 
          :disabled="processing || (actionChoice === 'change' && !isPortValid)"
        >
          <svg v-if="processing" class="spinner-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
          <span>{{ processing ? '正在处理...' : (actionChoice === 'kill' ? '强制释放并重启' : '保存并切换端口') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.port-conflict-modal {
  max-width: 480px !important;
}

.conflict-callout {
  background: rgba(255, 59, 48, 0.05) !important;
  border-color: rgba(255, 59, 48, 0.16) !important;
  margin-bottom: 14px;
}

[data-theme="dark"] .conflict-callout {
  background: rgba(255, 69, 58, 0.1) !important;
  border-color: rgba(255, 69, 58, 0.22) !important;
}

.conflict-callout .callout-icon {
  color: var(--color-danger, #ff3b30) !important;
}

.highlight-port {
  color: var(--color-danger, #ff3b30);
  background: rgba(255, 59, 48, 0.08);
  padding: 1px 6px;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

/* 设定新端口输入区 */
.input-container {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed rgba(0, 0, 0, 0.08);
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

.input-with-suggest {
  display: flex;
  align-items: center;
  gap: 8px;
}

.port-input-field {
  width: 96px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  text-align: center;
  padding: 6px 8px !important;
}

.suggest-pill {
  font-size: 11px;
  font-weight: 550;
  padding: 4px 10px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 102, 204, 0.08);
  border: 1px solid rgba(0, 102, 204, 0.16);
  color: var(--color-brand, #0066cc);
  cursor: pointer;
  white-space: nowrap;
  outline: none;
  transition: all 0.15s ease;
}

[data-theme="dark"] .suggest-pill {
  background: rgba(41, 151, 255, 0.15);
  border-color: rgba(41, 151, 255, 0.25);
  color: #2997ff;
}

.suggest-pill:hover {
  background: var(--color-brand, #0066cc);
  color: #ffffff;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.slide-fade-enter-active {
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-fade-leave-active {
  transition: all 0.15s ease-in;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-6px);
  opacity: 0;
}
</style>
