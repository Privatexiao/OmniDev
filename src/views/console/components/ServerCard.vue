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
  <div class="server-card glass-card">
    <div class="server-header">
      <div class="server-left">
        <span class="server-label">🖥️ 远程服务器</span>
        <template v-if="hasSSH()">
          <code>{{ showDetail ? sshInfo.host + ':' + sshInfo.port : '******:****' }}</code>
          <code>{{ showDetail ? sshInfo.username : '******' }}</code>
          <button class="btn-toggle-eye" @click="showDetail = !showDetail" :title="showDetail ? '隐藏' : '查看'">
            {{ showDetail ? '👁' : '🙈' }}
          </button>
        </template>
        <span class="text-muted" v-else>未配置</span>
        <span v-if="testResult" class="ssh-result-inline" :class="{ success: testSuccess }">{{ testResult }}</span>
      </div>
      <div class="server-right">
        <button class="btn-mini btn-mini-cancel" @click="openModal">⚙ 配置</button>
        <button class="btn-mini btn-mini-cancel" @click="testCardSSH" :disabled="testing || !hasSSH()">
          {{ testing ? '连接中...' : '⚡ 测试' }}
        </button>
        <button class="btn-mini btn-mini-cancel" @click="disconnectSSH" v-if="hasSSH()">🔌 断开</button>
      </div>
    </div>
  </div>

  <!-- SSH 配置弹窗 -->
  <Teleport to="body">
    <div class="modal-overlay" v-if="showModal" @click.self="handleOverlayClick">
      <div class="glass-card modal-content ssh-modal animate-zoom">
        <div class="modal-header">
          <h3>🔌 SSH 远程连接配置</h3>
          <button class="btn-close" @click="showModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group" v-if="sshHistory.length > 0" style="margin-bottom: 16px;">
            <label>⚡ 快速套用历史项目 SSH 配置</label>
            <div class="select-wrapper-with-clear" style="display: flex; gap: 8px; align-items: center;">
              <select v-model="selectedHistoryIndex" class="form-control" @change="applyHistoryConfig(selectedHistoryIndex)" style="border-color: var(--primary); background: rgba(99, 102, 241, 0.03); font-weight: 600; flex: 1;">
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
                {{ showPassword ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>

          <div v-if="testResult" class="ssh-result-box" :class="{ success: testSuccess }" style="margin-top:12px">
            {{ testResult }}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-mini btn-mini-cancel" @click="showModal = false">取消</button>
          <button class="btn-mini btn-mini-cancel" @click="testSSHWithForm" :disabled="testing" style="margin-right:auto">⚡ 测试连接</button>
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
  margin-bottom: 16px;
  padding: 8px 16px;
  border-radius: 10px;
}

.server-header {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
  justify-content: space-between;
  width: 100%;
}

.server-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.server-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.server-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
}

.server-header code {
  background: rgba(99, 102, 241, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--primary);
  font-size: 11px;
  flex-shrink: 0;
}

.spacer { flex: 1 1 0; min-width: 8px; }
.text-muted { color: var(--text-muted); font-size: 12px; }

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
  font-size: 0.8rem;
  padding: 0;
  opacity: 0.6;
  transition: opacity 0.2s;
  flex-shrink: 0;
}
.btn-toggle-eye:hover { opacity: 1; }

.btn-mini {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.btn-mini-primary {
  background: var(--primary);
  color: #fff;
}
.btn-mini-primary:hover { opacity: 0.9; }
.btn-mini-cancel {
  background: rgba(120, 120, 120, 0.08);
  border-color: rgba(120, 120, 120, 0.15);
  color: var(--text);
}
.btn-mini-cancel:hover { background: rgba(120, 120, 120, 0.16); }
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
