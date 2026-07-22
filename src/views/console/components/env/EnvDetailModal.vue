<script setup>
/**
 * @file EnvDetailModal.vue
 * @description 环境配置数据详情展示弹窗组件，方便用户免受编辑干扰地一键复制或核对当前选定环境的全部加密明细与物理映射
 */
import { ref, watch, computed } from 'vue'
import { copyToClipboard } from '../../../../utils/platform'

const props = defineProps({
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['message'])

const visible = ref(false)
const envName = ref('')
const envConfig = ref({})


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

// 🚀 暴露 show 方法供外部调用
const show = (name, config) => {
  envName.value = name
  envConfig.value = config || {}
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

// 🚀 剪贴板快速复制辅助方法
const copyText = async (text) => {
  if (!text) return
  const ok = await copyToClipboard(text)
  emit('message', { text: ok ? '已成功复制至剪贴板' : '复制失败，请重试', type: ok ? 'success' : 'error' })
}

// 🚀 智能数据格式化：解析各种键值对结构免密凭证
const normalizeCredentialFields = (raw) => {
  if (Array.isArray(raw)) {
    return raw
      .filter(item => item && item.key)
      .map(item => ({
        key: String(item.key || '').trim(),
        value: item.value || '',
        inject_type: item.inject_type || 'cookie',
        enabled: item.enabled !== false
      }))
  }
  return Object.entries(raw || {}).map(([key, val]) => {
    if (val && typeof val === 'object' && 'key' in val) {
      return {
        key: String(val.key || '').trim(),
        value: val.value || '',
        inject_type: val.inject_type || 'cookie',
        enabled: val.enabled !== false
      }
    }
    return {
      key: String(key || '').trim(),
      value: val || '',
      inject_type: 'cookie',
      enabled: true
    }
  }).filter(item => item && item.key)
}

defineExpose({
  show,
  hide,
  visible
})
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="handleOverlayClick">
    <div class="glass-card modal-content env-detail-modal animate-zoom">
      <div class="modal-header">
        <h3>环境配置详情: <span class="env-highlight-name">{{ envName }}</span></h3>
        <button class="btn-close" @click="hide">×</button>
      </div>
      
      <div class="modal-body env-modal-body">
        <!-- 1. 🔑 基础配置 -->
        <div class="detail-section">
          <h4 class="section-title">🔑 基础配置</h4>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">企业名称</span>
              <div class="detail-content">
                <span class="detail-value text-important">{{ envConfig.company_name || '未配置' }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.company_name)" v-if="envConfig.company_name">复制</button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">线上地址</span>
              <div class="detail-content">
                <span class="detail-value text-link">{{ envConfig.VUE_DEV_HOST || '未配置' }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.VUE_DEV_HOST)" v-if="envConfig.VUE_DEV_HOST">复制</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 💻 本地开发与登录凭证配置 -->
        <div class="detail-section">
          <h4 class="section-title">💻 本地开发与登录凭证配置</h4>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">本地端口</span>
              <div class="detail-content">
                <span class="detail-value" :class="envConfig.running ? 'text-success' : 'text-muted'">
                  {{ envConfig.running ? `🟢 ${envConfig.port || '分配中'}` : '🔴 未运行' }}
                </span>
                <button class="btn-copy-mini" @click="copyText(String(envConfig.port))" v-if="envConfig.running && envConfig.port">复制</button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.local_login_path">
              <span class="detail-label">本地登录子路径</span>
              <div class="detail-content">
                <span class="detail-value text-code">{{ envConfig.local_login_path }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.local_login_path)">复制</button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">指定 Node 版本</span>
              <div class="detail-content">
                <span class="detail-value" :class="envConfig.node_version ? 'text-highlight' : 'text-muted'">
                  {{ envConfig.node_version ? `🟢 ${envConfig.node_version}` : '⚪ 自动探测 (.nvmrc)' }}
                </span>
                <button class="btn-copy-mini" @click="copyText(envConfig.node_version)" v-if="envConfig.node_version">复制</button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.start_cmd">
              <span class="detail-label">自定义启动命令</span>
              <div class="detail-content">
                <span class="detail-value text-code">{{ envConfig.start_cmd }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.start_cmd)">复制</button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">启动状态</span>
              <div class="detail-content">
                <span class="detail-value" :class="envConfig.disable_start ? 'text-danger' : 'text-success'">
                  {{ envConfig.disable_start ? '已禁用' : '已启用' }}
                </span>
              </div>
            </div>
          </div>

          <!-- 子项目动态凭证值 -->
          <div class="dynamic-credentials" v-if="normalizeCredentialFields(envConfig.credentials).length > 0" style="margin-top: 14px;">
            <h5 class="sub-section-title" style="margin: 10px 0 8px 0; font-size: 13px; font-weight: 700; color: var(--text);">🔐 登录凭证注入明细 (Cookie / Token)</h5>
            <div class="detail-grid">
              <div class="detail-row" v-for="field in normalizeCredentialFields(envConfig.credentials)" :key="field.key" :class="{ 'cred-detail-disabled': field.enabled === false }">
                <span class="detail-label" :class="{ 'text-disabled-through': field.enabled === false }">
                  {{ field.key }}
                  <span v-if="field.enabled === false" class="cred-disabled-hint-text">(已禁用)</span>
                </span>
                <div class="detail-content">
                  <span class="auth-key-pill" :class="{ 'auth-key-pill-disabled': field.enabled === false }">{{ field.inject_type }}</span>
                  <span class="detail-value text-code truncate-value" :class="{ 'text-code-disabled': field.enabled === false }" :title="field.enabled === false ? '该凭证已被禁用，登录时将不注入该字段' : String(field.value)">
                    {{ field.enabled === false ? '已禁用' : (field.value || '未配置') }}
                  </span>
                  <button class="btn-copy-mini" @click="copyText(String(field.value))" v-if="field.value && field.enabled !== false">复制</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. 🚀 远程部署配置 -->
        <div class="detail-section">
          <h4 class="section-title">🚀 远程部署配置</h4>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">远程部署目录</span>
              <div class="detail-content">
                <span class="detail-value text-code">{{ envConfig.remote_dir || '未配置' }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.remote_dir)" v-if="envConfig.remote_dir">复制</button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">Git 分支状态</span>
              <div class="detail-content">
                <span class="detail-value" :class="envConfig.disable_branch ? 'text-danger' : 'text-success'">
                  {{ envConfig.disable_branch ? '已锁定 (禁用切换分支)' : '正常 (支持远程切换)' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. 🌐 一键登录配置 -->
        <div class="detail-section" v-if="envConfig.login_url || envConfig.online_username">
          <h4 class="section-title">🌐 一键登录配置</h4>
          <div class="detail-grid">
            <div class="detail-row" v-if="envConfig.login_url">
              <span class="detail-label">登录直达链接</span>
              <div class="detail-content">
                <span class="detail-value text-link truncate-value" :title="envConfig.login_url">{{ envConfig.login_url }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.login_url)">复制</button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.online_username">
              <span class="detail-label">线上登录账号</span>
              <div class="detail-content">
                <span class="detail-value text-important">{{ envConfig.online_username }}</span>
                <button class="btn-copy-mini" @click="copyText(envConfig.online_username)">复制</button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.login_url">
              <span class="detail-label">登录浏览器</span>
              <div class="detail-content">
                <span class="detail-value text-important" style="color: #38bdf8;">
                  {{ envConfig.login_browser === 'msedge' ? 'Microsoft Edge' : 'Chrome / Chromium' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-mini btn-mini-cancel" @click="hide">
          关闭详情
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.env-detail-modal {
  width: 680px;
  max-width: 95%;
  background: var(--panel-bg);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

[data-theme="dark"] .env-detail-modal {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.env-highlight-name {
  color: #4f46e5;
  font-weight: 700;
}

[data-theme="dark"] .env-highlight-name {
  color: #818cf8;
}

.detail-section {
  margin-bottom: 20px;
  background: rgba(0, 0, 0, 0.01);
  border-radius: 8px;
  padding: 14px 16px;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

[data-theme="dark"] .detail-section {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.03);
}

.detail-section .section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #374151;
  margin: 0 0 12px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 6px;
}

[data-theme="dark"] .detail-section .section-title {
  color: #e5e7eb;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 12px;
}

.detail-label {
  font-size: 0.85rem;
  font-weight: 550;
  color: #4b5563;
  min-width: 150px;
  white-space: nowrap;
}

[data-theme="dark"] .detail-label {
  color: #9ca3af;
}

.detail-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
  word-break: break-all;
}

[data-theme="dark"] .detail-value {
  color: #f3f4f6;
}

.detail-value.text-important {
  color: #4f46e5;
  font-weight: 700;
}

[data-theme="dark"] .detail-value.text-important {
  color: #a5b4fc;
}

.detail-value.text-link {
  color: #2563eb;
  font-family: monospace;
  font-size: 0.88rem;
  text-decoration: underline;
  text-underline-offset: 2px;
}

[data-theme="dark"] .detail-value.text-link {
  color: #60a5fa;
}

.detail-value.text-code {
  font-family: monospace;
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.03);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

[data-theme="dark"] .detail-value.text-code {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
}

.detail-value.text-success {
  color: #16a34a;
  font-weight: 700;
}

[data-theme="dark"] .detail-value.text-success {
  color: #4ade80;
}

.detail-value.text-danger {
  color: #dc2626;
  font-weight: 700;
}

[data-theme="dark"] .detail-value.text-danger {
  color: #f87171;
}

.truncate-value {
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

.cred-detail-disabled {
  opacity: 0.65;
}

.text-disabled-through {
  text-decoration: line-through;
  color: var(--text-muted) !important;
}

.cred-disabled-hint-text {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 4px;
  text-decoration: none;
  display: inline-block;
}

.auth-key-pill-disabled {
  background: rgba(120, 120, 120, 0.1) !important;
  color: var(--text-muted) !important;
}

.text-code-disabled {
  background: rgba(120, 120, 120, 0.04) !important;
  color: var(--text-muted) !important;
  cursor: not-allowed;
}

.btn-copy-mini {
  flex-shrink: 0;
  white-space: nowrap;
}

.auth-key-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 90px;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.08);
  color: var(--primary);
  font-size: 11px;
  font-weight: 600;
}
</style>
