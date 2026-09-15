<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  sshInfo: { type: Object, default: () => ({}) },
  closeOnOverlayClick: { type: Boolean, default: false }
})

const emit = defineEmits(['updated'])

const showDetail = ref(false)
const showModal = ref(false)
const showPassword = ref(false)
const testing = ref(false)
const testResult = ref('')
const testSuccess = ref(false)
const saving = ref(false)

const handleOverlayClick = () => {
  if (props.closeOnOverlayClick) {
    showModal.value = false
  }
}

const form = ref({
  host: '',
  port: 22,
  username: '',
  password: '',
  remote_path: ''
})

const sshHistory = ref([])
const selectedHistoryIndex = ref('')

const loadSSHHistory = async () => {
  try {
    const res = await fetch('/api/ssh/history')
    if (res.ok) {
      const data = await res.json()
      sshHistory.value = data.history || []
    }
  } catch (err) {
    console.error('获取历史 SSH 配置失败:', err)
  }
}

const applyHistoryConfig = (index) => {
  if (index === '' || index === null || index === undefined) return
  const selected = sshHistory.value[index]
  if (selected) {
    form.value = {
      host: selected.host || '',
      port: selected.port || 22,
      username: selected.username || '',
      password: selected.password || '',
      remote_path: selected.remote_path || ''
    }
  }
}

const clearHistorySelection = () => {
  selectedHistoryIndex.value = ''
  form.value = {
    host: '',
    port: 22,
    username: '',
    password: '',
    remote_path: ''
  }
}

watch(() => props.sshInfo, (info) => {
  testResult.value = ''
}, { immediate: true })

const openModal = () => {
  form.value = {
    host: props.sshInfo.host || '',
    port: props.sshInfo.port || 22,
    username: props.sshInfo.username || '',
    password: props.sshInfo.password || '',
    remote_path: props.sshInfo.remote_path || ''
  }
  selectedHistoryIndex.value = ''
  testResult.value = ''
  loadSSHHistory()
  showModal.value = true
}

const saveSSH = async () => {
  if (!form.value.host.trim()) { testResult.value = '⚠️ 请填写服务器地址'; testSuccess.value = false; return }
  if (!form.value.username.trim()) { testResult.value = '⚠️ 请填写用户名'; testSuccess.value = false; return }
  saving.value = true
  try {
    const res = await fetch('/api/ssh/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value)
    })
    if (res.ok) {
      showModal.value = false
      emit('updated')
    }
  } catch (e) { /* ignore */ }
  finally { saving.value = false }
}

// 弹窗内测试：直接用表单当前填写的值
const testSSHWithForm = async () => {
  if (testing.value) return
  if (!form.value.host.trim()) {
    testSuccess.value = false
    testResult.value = '⚠️ 请填写服务器地址'
    return
  }
  if (!form.value.username.trim()) {
    testSuccess.value = false
    testResult.value = '⚠️ 请填写用户名'
    return
  }
  if (!form.value.password) {
    testSuccess.value = false
    testResult.value = '⚠️ 请填写登录密码'
    return
  }
  testing.value = true
  testResult.value = '⏳ 正在连接...'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch('/api/ssh/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    const data = await res.json()
    if (res.ok) {
      testSuccess.value = true
      testResult.value = `🟢 连接成功！服务器运行账户: ${data.result.stdout.trim()}`
    } else {
      testSuccess.value = false
      testResult.value = `🔴 连接失败: ${data.error}`
    }
  } catch (err) {
    clearTimeout(timer)
    testSuccess.value = false
    testResult.value = err.name === 'AbortError'
      ? '⏰ 连接超时（20秒），请检查服务器地址与端口是否正确'
      : `🔴 连接失败: ${err.message}`
  } finally {
    testing.value = false
  }
}

// 卡片上测试：同理加校验和超时
const testCardSSH = async () => {
  if (testing.value || !hasSSH()) return
  testing.value = true
  testResult.value = '⏳ 正在连接...'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch('/api/ssh/test', {
      method: 'POST',
      signal: ctrl.signal
    })
    clearTimeout(timer)
    const data = await res.json()
    if (res.ok) {
      testSuccess.value = true
      testResult.value = `🟢 连接成功！服务器运行账户: ${data.result.stdout.trim()}`
    } else {
      testSuccess.value = false
      testResult.value = `🔴 连接失败: ${data.error}`
    }
  } catch (err) {
    clearTimeout(timer)
    testSuccess.value = false
    testResult.value = err.name === 'AbortError'
      ? '⏰ 连接超时（20秒），请检查服务器地址与端口是否正确'
      : `🔴 连接失败: ${err.message}`
  } finally {
    testing.value = false
  }
}

const disconnectSSH = async () => {
  try {
    await fetch('/api/ssh/disconnect', { method: 'POST' })
    testResult.value = '🔌 已断开'
    testSuccess.value = false
  } catch (e) { /* ignore */ }
}

const hasSSH = () => !!(props.sshInfo && props.sshInfo.host)
</script>

<template>
  <div class="server-card hub-card glass-card">
    <div class="hub-card-header">
      <div class="hub-header-title">
        <span class="hub-icon">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="12" height="4" rx="1"/>
            <rect x="2" y="9" width="12" height="4" rx="1"/>
            <circle cx="5" cy="5" r="0.75" fill="currentColor"/>
            <circle cx="5" cy="11" r="0.75" fill="currentColor"/>
          </svg>
        </span>
        <span>远程部署集群</span>
      </div>
      <span class="hub-badge" :class="hasSSH() ? (testSuccess ? 'badge-running' : 'badge-neutral') : 'badge-idle'">
        <span class="hub-badge-dot"></span>
        <span>{{ hasSSH() ? (testSuccess ? '已连通' : '已配置') : '未配置' }}</span>
      </span>
    </div>

    <div class="hub-card-body">
      <div class="hub-metric-row" v-if="hasSSH()">
        <span class="hub-metric-num">{{ sshInfo.port || 22 }}</span>
        <span class="hub-metric-unit">
          端口 · {{ showDetail ? (sshInfo.host || '未配置') : '••••••••' }}
          <span class="server-user-tag" v-if="sshInfo.username">({{ showDetail ? sshInfo.username : '••••' }})</span>
        </span>
        <button class="btn-toggle-eye" @click="showDetail = !showDetail" :title="showDetail ? '隐藏敏感信息' : '查看明文信息'">
          <svg v-if="showDetail" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/></svg>
          <svg v-else viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l12 12M6.5 6.5a2.5 2.5 0 0 0 3.5 3.5M1.5 8s2.5-4.5 6.5-4.5c1.4 0 2.6.5 3.6 1.3M14.5 8s-2.5 4.5-6.5 4.5c-1.8 0-3.3-.8-4.5-2"/></svg>
        </button>
      </div>
      <div class="hub-metric-row" v-else>
        <span class="hub-metric-num" style="color: var(--text-muted); font-size: 1.5rem;">未配置</span>
        <span class="hub-metric-unit">待绑定目标服务器</span>
      </div>
    </div>

    <div class="hub-card-footer server-actions-footer">
      <div class="server-result-status">
        <span v-if="testResult" class="ssh-result-text" :class="{ success: testSuccess }">{{ testResult }}</span>
        <span v-else class="ssh-tip-text">支持生产软链直连</span>
      </div>
      <div class="server-btn-group">
        <button class="hub-action-btn" @click="openModal" title="配置 SSH 连接参数">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/></svg>
          <span>配置</span>
        </button>
        <button class="hub-action-btn" @click="testCardSSH" :disabled="testing || !hasSSH()" title="测试连通性">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5L2.5 9h5l-1 5.5L13.5 7h-5l1-5.5z"/></svg>
          <span>{{ testing ? '...' : '测试' }}</span>
        </button>
        <button class="hub-action-btn danger-hover" @click="disconnectSSH" v-if="hasSSH()" title="断开 SSH 连接">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5l2-2a2.12 2.12 0 0 1 3 3l-2 2"/><path d="M6.5 9.5l-2 2a2.12 2.12 0 1 1-3-3l2-2"/><path d="M2 2l12 12"/></svg>
          <span>断开</span>
        </button>
      </div>
    </div>
  </div>

  <!-- SSH 配置弹窗 -->
  <Teleport to="body">
    <div class="modal-overlay" v-if="showModal" @click.self="handleOverlayClick">
      <div class="glass-card modal-content ssh-modal animate-zoom">
        <div class="modal-header">
          <h3>SSH 远程连接配置</h3>
          <button class="btn-close" @click="showModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group" v-if="sshHistory.length > 0" style="margin-bottom: 16px;">
            <label>快速套用历史项目 SSH 配置</label>
            <div class="select-wrapper-with-clear" style="display: flex; gap: 8px; align-items: center;">
              <select v-model="selectedHistoryIndex" class="form-control" @change="applyHistoryConfig(selectedHistoryIndex)" style="font-weight: 600; flex: 1;">
                <option value="" disabled>-- 选择已有配置进行一键填充 --</option>
                <option v-for="(item, idx) in sshHistory" :key="idx" :value="idx">
                  [{{ item.projectName }}] - {{ item.username }}@{{ item.host }}:{{ item.port }}
                </option>
              </select>
              <button 
                v-if="selectedHistoryIndex !== ''"
                type="button" 
                class="btn-clear-history" 
                @click="clearHistorySelection" 
                title="清除选择并清空表单"
                style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 6px; padding: 0; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>服务器地址</label>
            <input v-model="form.host" type="text" class="form-control" placeholder="192.168.1.10" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>端口</label>
              <input v-model.number="form.port" type="number" min="1" max="65535" class="form-control" />
            </div>
            <div class="form-group">
              <label>用户名</label>
              <input v-model="form.username" type="text" class="form-control" placeholder="deploy" />
            </div>
          </div>
          <div class="form-group password-group">
            <label>密码</label>
            <div class="password-input-wrapper">
              <input v-model="form.password" :type="showPassword ? 'text' : 'password'" class="form-control" placeholder="输入远程登录密码..." autocomplete="new-password" />
              <button type="button" class="btn-toggle-password-input" @click="showPassword = !showPassword" :title="showPassword ? '隐藏密码' : '显示密码'">
                <svg v-if="showPassword" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l12 12M6.5 6.5a2.5 2.5 0 0 0 3.5 3.5M1.5 8s2.5-4.5 6.5-4.5c1.4 0 2.6.5 3.6 1.3M14.5 8s-2.5 4.5-6.5 4.5c-1.8 0-3.3-.8-4.5-2"/></svg>
                <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/></svg>
              </button>
            </div>
          </div>

          <div v-if="testResult" class="ssh-result-box" :class="{ success: testSuccess }" style="margin-top:12px">
            {{ testResult }}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-mini btn-mini-cancel" @click="showModal = false">取消</button>
          <button class="btn-mini btn-mini-cancel" @click="testSSHWithForm" :disabled="testing" style="margin-right:auto">测试连接</button>
          <button class="btn-mini btn-mini-primary" @click="saveSSH" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.server-card {
  margin-bottom: 0;
  padding: 16px 20px;
  border-radius: var(--radius-card, 20px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 120px;
  box-sizing: border-box;
}

.hub-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}

.hub-header-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: -0.01em;
}

.hub-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.hub-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
  font-size: 11px;
  font-weight: 600;
}

.hub-badge.badge-running {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success, #34c759);
  border: 1px solid rgba(52, 199, 89, 0.25);
}

.hub-badge.badge-idle {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .hub-badge.badge-idle {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.hub-badge.badge-neutral {
  background: rgba(0, 113, 227, 0.08);
  color: var(--color-brand, #0071e3);
  border: 1px solid rgba(0, 113, 227, 0.2);
}

[data-theme="dark"] .hub-badge.badge-neutral {
  background: rgba(41, 151, 255, 0.12);
  color: #2997ff;
  border-color: rgba(41, 151, 255, 0.25);
}

.hub-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: currentColor;
}

.badge-running .hub-badge-dot {
  animation: hub-pulse-glow 1.8s infinite ease-in-out;
}

@keyframes hub-pulse-glow {
  0%, 100% { opacity: 0.6; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.3); }
}

.hub-card-body {
  margin-bottom: 8px;
}

.hub-metric-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.hub-metric-num {
  font-size: 2.1rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.035em;
  color: var(--text);
  font-family: "SF Pro Display", BlinkMacSystemFont, sans-serif;
  flex-shrink: 0;
}

.hub-metric-unit {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-user-tag {
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 2px;
}

.btn-toggle-eye {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  transition: color 0.15s ease;
  flex-shrink: 0;
}

.btn-toggle-eye:hover {
  color: var(--color-brand, #0066cc);
}

.server-empty-hint {
  font-size: 11.5px;
  color: var(--text-muted);
}

.server-actions-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  margin-top: 4px;
  min-height: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  gap: 12px;
  box-sizing: border-box;
}

[data-theme="dark"] .server-actions-footer {
  border-top-color: rgba(255, 255, 255, 0.05);
}

.server-result-status {
  font-size: 11px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ssh-result-text {
  color: #ef4444;
  font-weight: 500;
}

.ssh-result-text.success {
  color: var(--color-success, #34c759);
}

.ssh-tip-text {
  color: var(--text-muted);
}

.server-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.hub-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 9px;
  height: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: var(--radius-pill, 980px);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  outline: none;
  vertical-align: middle;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.hub-action-btn svg {
  display: block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.hub-action-btn span {
  display: inline-block;
  line-height: 1;
}

[data-theme="dark"] .hub-action-btn {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.hub-action-btn:hover:not(:disabled) {
  background: var(--surface, #ffffff);
  color: var(--text);
  border-color: rgba(0, 0, 0, 0.15);
  transform: translateY(-0.5px);
}

[data-theme="dark"] .hub-action-btn:hover:not(:disabled) {
  background: #2c2c2e;
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.15);
}

.hub-action-btn.danger-hover:hover:not(:disabled) {
  color: var(--color-danger, #ff3b30);
  border-color: rgba(255, 59, 48, 0.3);
  background: rgba(255, 59, 48, 0.06);
}

.hub-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ssh-result-inline {
  font-size: 12px;
  color: #ef4444;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}
.ssh-result-inline.success { color: #10b981; }

.btn-toggle-eye {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  color: var(--text-secondary);
  opacity: 0.7;
  transition: all 0.2s;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}
.btn-toggle-eye:hover { opacity: 1; color: var(--text); }

.btn-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-pill, 9999px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.btn-mini-primary {
  background: var(--color-brand, #0071e3);
  color: #fff;
}
.btn-mini-primary:hover { opacity: 0.9; }
.btn-mini-cancel {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: var(--text);
}
[data-theme="dark"] .btn-mini-cancel {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}
.btn-mini-cancel:hover { background: rgba(0, 0, 0, 0.08); }
[data-theme="dark"] .btn-mini-cancel:hover { background: rgba(255, 255, 255, 0.12); }
.btn-mini:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---- 弹窗样式 ---- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.ssh-modal {
  width: 460px;
  max-width: 90vw;
  border-radius: 12px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(120, 120, 120, 0.1);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0;
  line-height: 1;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid rgba(120, 120, 120, 0.1);
  justify-content: flex-end;
}

.form-row {
  display: flex;
  gap: 10px;
}

.form-row .form-group { flex: 1; }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.form-group label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.form-control {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(120, 120, 120, 0.2);
  background: rgba(120, 120, 120, 0.05);
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.form-control:focus { border-color: var(--primary); }

.animate-zoom {
  animation: zoomIn 0.2s ease;
}
@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.password-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.password-input-wrapper .form-control {
  padding-right: 36px;
  width: 100%;
}
.btn-toggle-password-input {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.btn-toggle-password-input:hover {
  opacity: 1;
}
.btn-clear-history:hover {
  background: #ef4444 !important;
  color: #ffffff !important;
  border-color: #ef4444 !important;
}
</style>
