<script setup>
/**
 * @file StatusBadges.vue
 * @description 头部状态指示徽章组件，负责展示后端服务连接状态、本地开发服务全局启动状态及提供文档访问链接
 */
import { openExternal } from '../../../../utils/platform'

// 声明 Props 验证，指定 Type 与 Default 默认值
defineProps({
  isServerConnected: {
    type: Boolean,
    default: false
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  allEnvs: {
    type: Array,
    default: () => []
  },
  serverPort: {
    type: Number,
    default: 3300
  },
  stoppingEnvName: {
    type: String,
    default: ''
  },
  stopControlsLocked: {
    type: Boolean,
    default: false
  }
})

defineEmits(['start-server', 'stop-env', 'launch-local'])
</script>

<template>
  <div class="status-badges-group">
    <!-- server.js 辅助服务状态 -->
    <div class="status-badge tooltip-trigger">
      <span class="status-dot" :class="{ active: isServerConnected }"></span>
      <span>控制端后台: {{ isServerConnected ? `已启动 (${serverPort})` : '未连接/未启动' }}</span>
      
      <!-- 🔌 服务未连接时的毛玻璃引导气泡 -->
      <div class="custom-tooltip server-hint-tooltip" v-if="!isServerConnected">
        <div class="tooltip-header">
          <span>⚠️ 控制端后台服务未启动</span>
        </div>
        <div class="tooltip-divider"></div>
        <div class="tooltip-body">
          <p class="hint-desc">检测到后端服务 (端口 {{ serverPort }}) 尚未运行，大盘数据与环境管理功能暂时不可用。</p>
          <button class="hint-start-btn" @click.stop="$emit('start-server')">
            🚀 一键启动
          </button>
          <p class="hint-tip">💡 启动后控制台将自动检测并恢复连接。</p>
        </div>
      </div>
    </div>
    
    <!-- Vue 2 本地开发服务状态：支持极简状态显示与悬浮毛玻璃“所有本地项目”全景气泡 -->
    <div class="status-badge tooltip-trigger">
      <span class="status-dot" :class="{ active: isRunning }"></span>
      <span>本地服务: {{ isRunning ? '正在运行' : '已停止' }}</span>
      
      <!-- 🌟 超高颜值的毛玻璃悬浮气泡 Tooltip (仅展现所有项目当前启动运行的本地服务) -->
      <div class="custom-tooltip" v-if="allEnvs && allEnvs.length > 0">
        <div class="tooltip-header">
          <span>🚀 运行中的本地项目 ({{ allEnvs.length }} 个)</span>
        </div>
        <div class="tooltip-divider"></div>
        <div class="tooltip-body">
          <div 
            v-for="env in allEnvs" 
            :key="env.projectName + '_' + env.envName" 
            class="tooltip-env-item"
          >
            <!-- 运行中亮绿灯带呼吸感 -->
            <span class="tooltip-env-dot dot-running"></span>
            
            <div class="tooltip-env-info">
              <span class="tooltip-project-tag">[{{ env.projectName }}]</span>
              <span class="tooltip-env-name" :title="env.envName">{{ env.envName }}</span>
              <!-- 动态显示被占用的本地调试端口 -->
              <span 
                v-if="env.port" 
                class="tooltip-env-port" 
                @click.stop="$emit('launch-local', env)"
                title="点击登录本地系统端口"
              >:{{ env.port }}</span>
            </div>
            
            <div class="tooltip-env-actions">
              <span 
                v-if="env.port" 
                class="tooltip-open-link" 
                @click.stop="$emit('launch-local', env)"
                title="一键登录并直达本地系统页面"
              >打开</span>
              <span v-else class="tooltip-status-text">运行中</span>
              
              <span class="tooltip-action-divider">|</span>
              
              <button 
                class="tooltip-stop-btn" 
                :class="{ 'is-stopping': stoppingEnvName === env.envName }"
                :disabled="stopControlsLocked"
                @click.stop="$emit('stop-env', env.envName)"
                :title="stoppingEnvName === env.envName ? '正在停止，请稍候' : '强关该环境本地服务'"
              >
                {{ stoppingEnvName === env.envName ? '停止中...' : '停止' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-badges-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  user-select: none;
}

[data-theme="dark"] .status-badge {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}

.status-badge:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

[data-theme="dark"] .status-badge:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.18);
}

/* 🟢 呼吸指示灯 */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #94a3b8;
  transition: all 0.3s ease;
}

.status-dot.active {
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* 🌟 高颜值 Glassmorphism 毛玻璃气泡 */
.custom-tooltip {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 10px;
  width: 360px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 14px;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px);
  transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  text-align: left;
}

.custom-tooltip::before {
  content: '';
  position: absolute;
  top: -12px;
  left: 0;
  width: 100%;
  height: 12px;
  background: transparent;
}

[data-theme="dark"] .custom-tooltip {
  background: rgba(30, 41, 59, 0.88);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

/* 悬浮显示 */
.status-badge:hover .custom-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto; /* 🌟 鼠标进入气泡时，依然能稳稳占住 hover 状态，不会闪退！ */
}

.tooltip-header {
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
}

[data-theme="dark"] .tooltip-header {
  color: #94a3b8;
}

.tooltip-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 8px 0;
}

[data-theme="dark"] .tooltip-divider {
  background: rgba(255, 255, 255, 0.08);
}

.tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

/* 滚动条精细美化 */
.tooltip-body::-webkit-scrollbar {
  width: 4px;
}
.tooltip-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}
[data-theme="dark"] .tooltip-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
}

.tooltip-env-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.8rem;
  padding: 2px 0;
}

.tooltip-project-tag {
  font-size: 0.72rem;
  color: #6366f1;
  font-weight: 800;
  background: rgba(99, 102, 241, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 4px;
  flex-shrink: 0;
}

[data-theme="dark"] .tooltip-project-tag {
  color: #818cf8;
  background: rgba(129, 140, 248, 0.15);
}

.tooltip-env-info {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.tooltip-env-name {
  color: #1e293b;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

[data-theme="dark"] .tooltip-env-name {
  color: #f1f5f9;
}

.tooltip-env-port {
  font-family: monospace;
  font-size: 0.75rem;
  color: #10b981;
  font-weight: 700;
  background: rgba(16, 185, 129, 0.08);
  padding: 1px 4px;
  border-radius: 4px;
}

[data-theme="dark"] .tooltip-env-port {
  background: rgba(16, 185, 129, 0.15);
}

.tooltip-status-text {
  font-size: 0.72rem;
  color: #10b981;
  font-weight: 700;
}

.item-stopped .tooltip-status-text {
  color: #94a3b8;
  font-weight: 550;
}

[data-theme="dark"] .item-stopped .tooltip-status-text {
  color: #64748b;
}

.tooltip-env-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #cbd5e1;
  transition: all 0.3s ease;
}

[data-theme="dark"] .tooltip-env-dot {
  background-color: #475569;
}

.tooltip-env-dot.dot-running {
  background-color: #10b981;
  box-shadow: 0 0 6px #10b981;
}

a.tooltip-env-port {
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

a.tooltip-env-port:hover {
  background: rgba(16, 185, 129, 0.18);
  text-decoration: underline;
}

.tooltip-open-link {
  font-size: 0.72rem;
  color: #6366f1;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.tooltip-open-link:hover {
  color: #4f46e5;
  text-decoration: underline;
}

[data-theme="dark"] .tooltip-open-link {
  color: #818cf8;
}

[data-theme="dark"] .tooltip-open-link:hover {
  color: #a5b4fc;
}

/* 🔌 服务未启动引导气泡专属样式 */
.server-hint-tooltip {
  width: 300px;
}

.hint-desc {
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.6;
  margin: 0 0 6px 0;
}

[data-theme="dark"] .hint-desc {
  color: #94a3b8;
}

.hint-start-btn {
  display: block;
  width: 100%;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
  border: none;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  margin: 10px 0 8px 0;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

.hint-start-btn:hover {
  background: linear-gradient(135deg, #4f46e5, #4338ca);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
}

.hint-start-btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(99, 102, 241, 0.2);
}

.hint-tip {
  font-size: 0.72rem;
  color: #10b981;
  font-weight: 600;
  margin: 4px 0 0 0;
}

[data-theme="dark"] .hint-tip {
  color: #34d399;
}

/* 本地服务气泡操作动作区 */
.tooltip-env-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.tooltip-action-divider {
  color: rgba(120, 120, 120, 0.25);
  font-size: 11px;
  user-select: none;
}

.tooltip-stop-btn {
  background: transparent;
  border: none;
  font-size: 0.72rem;
  font-weight: 700;
  color: #ef4444;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
}

.tooltip-stop-btn:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
}

.tooltip-stop-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.tooltip-stop-btn.is-stopping {
  color: #f59e0b;
  opacity: 1;
}

[data-theme="dark"] .tooltip-stop-btn {
  color: #f87171;
}

[data-theme="dark"] .tooltip-stop-btn:hover {
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
}

span.tooltip-env-port {
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

span.tooltip-env-port:hover {
  background: rgba(16, 185, 129, 0.18);
  text-decoration: underline;
}
</style>
