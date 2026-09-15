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
        <div class="header-left">
          <div class="header-icon-box brand">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="header-title-wrap">
            <h3 class="modal-title">
              环境配置明细
              <span class="env-badge-pill">{{ envName }}</span>
            </h3>
            <p class="modal-desc">核对环境的物理端口、登录凭据与线上映射配置</p>
          </div>
        </div>
        <button class="btn-close press-spring" @click="hide" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="modal-body env-modal-body">
        <!-- 1. 基础配置 -->
        <div class="detail-section">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>基础配置</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">企业描述</span>
              <div class="detail-content">
                <span class="detail-value text-important">{{ envConfig.company_name || '未配置' }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.company_name)" v-if="envConfig.company_name" title="复制企业名称">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">线上部署地址</span>
              <div class="detail-content">
                <span class="detail-value text-link">{{ envConfig.VUE_DEV_HOST || '未配置' }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.VUE_DEV_HOST)" v-if="envConfig.VUE_DEV_HOST" title="复制线上地址">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 本地开发与启动配置 -->
        <div class="detail-section">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>本地开发与运行态</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">本地服务端口</span>
              <div class="detail-content">
                <span class="detail-status-badge" :class="envConfig.running ? 'running' : 'idle'">
                  <span class="status-dot"></span>
                  <span>{{ envConfig.running ? `${envConfig.port || '已启动'}` : '未运行' }}</span>
                </span>
                <button class="btn-copy-mini press-spring" @click="copyText(String(envConfig.port))" v-if="envConfig.running && envConfig.port" title="复制端口号">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.local_login_path">
              <span class="detail-label">本地登录子路径</span>
              <div class="detail-content">
                <span class="detail-value text-code">{{ envConfig.local_login_path }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.local_login_path)" title="复制子路径">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">Node 环境版本</span>
              <div class="detail-content">
                <span class="node-version-pill">
                  {{ envConfig.node_version ? `v${envConfig.node_version}` : '自动探测 (.nvmrc)' }}
                </span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.node_version)" v-if="envConfig.node_version" title="复制Node版本">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.start_cmd">
              <span class="detail-label">自定义启动命令</span>
              <div class="detail-content">
                <span class="detail-value text-code">{{ envConfig.start_cmd }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.start_cmd)" title="复制启动命令">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">启动开关</span>
              <div class="detail-content">
                <span class="detail-tag-pill" :class="envConfig.disable_start ? 'disabled-tag' : 'enabled-tag'">
                  {{ envConfig.disable_start ? '已禁用本地启动' : '已启用启动' }}
                </span>
              </div>
            </div>
          </div>

          <!-- 免密登录凭证注入明细 -->
          <div class="dynamic-credentials" v-if="normalizeCredentialFields(envConfig.credentials).length > 0">
            <div class="cred-sub-header">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>免密凭据注入明细</span>
            </div>
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
                  <button class="btn-copy-mini press-spring" @click="copyText(String(field.value))" v-if="field.value && field.enabled !== false" title="复制凭据值">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>复制</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. 远程部署配置 -->
        <div class="detail-section">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                <path d="M12 12v9"></path>
                <path d="m8 17 4 4 4-4"></path>
              </svg>
              <span>远程部署配置</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-row">
              <span class="detail-label">远程部署物理目录</span>
              <div class="detail-content">
                <span class="detail-value text-code">{{ envConfig.remote_dir || '未配置' }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.remote_dir)" v-if="envConfig.remote_dir" title="复制目录路径">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row">
              <span class="detail-label">Git 分支操作</span>
              <div class="detail-content">
                <span class="detail-tag-pill" :class="envConfig.disable_branch ? 'disabled-tag' : 'enabled-tag'">
                  {{ envConfig.disable_branch ? '已禁用分支切换' : '支持远程检出' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. 一键登录配置 -->
        <div class="detail-section" v-if="envConfig.login_url || envConfig.online_username">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>一键免密登录参数</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-row" v-if="envConfig.login_url">
              <span class="detail-label">登录直达链接</span>
              <div class="detail-content">
                <span class="detail-value text-link truncate-value" :title="envConfig.login_url">{{ envConfig.login_url }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.login_url)" title="复制登录链接">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.online_username">
              <span class="detail-label">线上免密账号</span>
              <div class="detail-content">
                <span class="detail-value text-important">{{ envConfig.online_username }}</span>
                <button class="btn-copy-mini press-spring" @click="copyText(envConfig.online_username)" title="复制账号">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>复制</span>
                </button>
              </div>
            </div>

            <div class="detail-row" v-if="envConfig.login_url">
              <span class="detail-label">指定拉起浏览器</span>
              <div class="detail-content">
                <span class="detail-tag-pill browser-tag">
                  {{ envConfig.login_browser === 'msedge' ? 'Microsoft Edge' : 'Chrome / Chromium' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-pill-secondary press-spring" @click="hide">
          关闭窗口
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.env-detail-modal {
  max-width: 680px !important;
  width: 94vw;
  border-radius: var(--radius-card, 20px);
}

.env-badge-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
  border: 1px solid rgba(0, 102, 204, 0.16);
}

[data-theme="dark"] .env-badge-pill {
  background: rgba(41, 151, 255, 0.15);
  border-color: rgba(41, 151, 255, 0.25);
  color: #2997ff;
}

.detail-section {
  background: rgba(0, 0, 0, 0.016);
  border: 1px solid rgba(0, 0, 0, 0.045);
  border-radius: 14px;
  padding: 13px 16px;
  margin-bottom: 12px;
}

[data-theme="dark"] .detail-section {
  background: rgba(255, 255, 255, 0.022);
  border-color: rgba(255, 255, 255, 0.05);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.section-icon {
  color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .section-icon {
  color: #2997ff;
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 12px;
}

.detail-label {
  font-size: 12px;
  font-weight: 550;
  color: var(--text-secondary, #6e6e73);
  min-width: 130px;
  white-space: nowrap;
  letter-spacing: var(--tracking-body, -0.006em);
}

.detail-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.detail-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  word-break: break-all;
}

.detail-value.text-important {
  color: var(--text);
  font-weight: 650;
}

.detail-value.text-link {
  color: var(--color-brand, #0066cc);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  text-decoration: none;
}

[data-theme="dark"] .detail-value.text-link {
  color: #2997ff;
}

.detail-value.text-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11.5px;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: var(--text);
}

[data-theme="dark"] .detail-value.text-code {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.06);
}

.truncate-value {
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

/* 状态与指示胶囊 */
.detail-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 980px);
}

.detail-status-badge.running {
  background: rgba(52, 199, 89, 0.1);
  color: var(--success, #34c759);
}

.detail-status-badge.idle {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);
}

[data-theme="dark"] .detail-status-badge.idle {
  background: rgba(255, 255, 255, 0.06);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.detail-status-badge.running .status-dot {
  box-shadow: 0 0 6px currentColor;
}

.node-version-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 0, 0, 0.045);
  color: var(--text);
}

[data-theme="dark"] .node-version-pill {
  background: rgba(255, 255, 255, 0.08);
}

.detail-tag-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 980px);
}

.detail-tag-pill.enabled-tag {
  background: rgba(52, 199, 89, 0.1);
  color: var(--success, #34c759);
}

.detail-tag-pill.disabled-tag {
  background: rgba(255, 59, 48, 0.08);
  color: var(--color-danger, #ff3b30);
}

.detail-tag-pill.browser-tag {
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .detail-tag-pill.browser-tag {
  background: rgba(41, 151, 255, 0.15);
  color: #2997ff;
}

/* 凭据明细 */
.dynamic-credentials {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

[data-theme="dark"] .dynamic-credentials {
  border-top-color: rgba(255, 255, 255, 0.05);
}

.cred-sub-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.auth-key-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
  font-size: 10px;
  font-weight: 600;
  text-transform: lowercase;
}

[data-theme="dark"] .auth-key-pill {
  background: rgba(41, 151, 255, 0.15);
  color: #2997ff;
}

.btn-copy-mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 500;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

[data-theme="dark"] .btn-copy-mini {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.btn-copy-mini:hover {
  background: var(--color-brand, #0066cc);
  border-color: var(--color-brand, #0066cc);
  color: #ffffff;
}

[data-theme="dark"] .btn-copy-mini:hover {
  background: #2997ff;
  border-color: #2997ff;
  color: #ffffff;
}

.cred-detail-disabled {
  opacity: 0.55;
}

.text-disabled-through {
  text-decoration: line-through;
}

.cred-disabled-hint-text {
  font-size: 10px;
  color: var(--text-muted);
  text-decoration: none;
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
</style>
