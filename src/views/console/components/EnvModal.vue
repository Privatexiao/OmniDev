<script setup>
import { ref, watch, computed } from 'vue'


const emit = defineEmits(['success', 'message'])

const visible = ref(false)
const envModalType = ref('add')
const oldEnvKey = ref('')
const savingEnv = ref(false)

const showServerSettings = ref(false)
const showCredentialSettings = ref(false)
const showAutoLoginSettings = ref(false)
const showCredentialFieldModal = ref(false)
const showPassword = ref(false)

const createEmptyEnvForm = () => ({
  envKey: '',
  company_name: '',
  VUE_DEV_HOST: '',
  remote_dir: '',
  credentials: [],
  local_port: '',
  node_version: '16.17.0',
  start_cmd: '',
  login_url: '',
  online_username: '',
  online_password: '',
  login_browser: 'chrome',
  disable_branch: false,
  disable_start: false
})

const envForm = ref(createEmptyEnvForm())

const credentialFieldForm = ref({ key: '', value: '', inject_type: 'cookie' })

watch(visible, (isOpen) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
})

const show = (mode, name, config) => {
  envModalType.value = mode || 'add'
  showServerSettings.value = false
  showCredentialSettings.value = false
  showAutoLoginSettings.value = false
  showCredentialFieldModal.value = false
  showPassword.value = false

  if (mode === 'edit') {
    oldEnvKey.value = name
    envForm.value = {
      envKey: name,
      company_name: config.company_name || '',
      VUE_DEV_HOST: config.VUE_DEV_HOST || '',
      remote_dir: config.remote_dir || '',
      credentials: normalizeCredentialFields(config.credentials ? JSON.parse(JSON.stringify(config.credentials)) : []),
      local_port: config.local_port || '',
      node_version: config.node_version || '',
      start_cmd: config.start_cmd || '',
      login_url: config.login_url || '',
      online_username: config.online_username || '',
      online_password: config.online_password || '',
      login_browser: config.login_browser || 'chrome',
      disable_branch: !!config.disable_branch,
      disable_start: !!config.disable_start
    }
    // 自动登录配置如果有内容不为空直接展开即可
    if (envForm.value.login_url || envForm.value.online_username || envForm.value.online_password) {
      showAutoLoginSettings.value = true
    }
  } else {
    oldEnvKey.value = ''
    envForm.value = createEmptyEnvForm()
  }
  visible.value = true
}

const hide = () => { visible.value = false }

const activeCredentialFields = computed(() =>
  Array.isArray(envForm.value.credentials) ? envForm.value.credentials : normalizeCredentialFields(envForm.value.credentials)
)

const normalizeCredentialFields = (raw) => {
  if (Array.isArray(raw)) {
    return raw.filter(item => item && item.key).map(item => ({
      key: String(item.key || '').trim(),
      value: item.value || '',
      inject_type: item.inject_type || 'cookie'
    }))
  }
  return Object.entries(raw || {}).map(([key, val]) => {
    if (val && typeof val === 'object' && 'key' in val) {
      return { key: String(val.key || '').trim(), value: val.value || '', inject_type: val.inject_type || 'cookie' }
    }
    return { key: String(key || '').trim(), value: val || '', inject_type: 'cookie' }
  }).filter(item => item && item.key)
}

const addCredentialField = () => {
  const cleanName = credentialFieldForm.value.key.trim()
  if (!cleanName) {
    emit('message', { text: '请填写凭证字段名称', type: 'warning' })
    return
  }
  const fields = normalizeCredentialFields(envForm.value.credentials)
  if (fields.some(item => item.key === cleanName)) {
    emit('message', { text: `字段 [${cleanName}] 已存在`, type: 'warning' })
    return
  }
  fields.push({
    key: cleanName,
    value: credentialFieldForm.value.value || '',
    inject_type: credentialFieldForm.value.inject_type || 'cookie'
  })
  envForm.value.credentials = fields
  // 🚀 每次点击确定成功新增后，主动清空已填写的内容以备下次录入
  credentialFieldForm.value = { key: '', value: '', inject_type: 'cookie' }
  showCredentialFieldModal.value = false
}

const removeCredentialField = (fieldName) => {
  envForm.value.credentials = normalizeCredentialFields(envForm.value.credentials)
    .filter(item => item.key !== fieldName)
}



const saveEnvConfig = async () => {
  const key = envForm.value.envKey.trim()
  if (!key) {
    emit('message', { text: '环境唯一标识不能为空', type: 'warning' })
    return
  }
  const cleanKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (!cleanKey) {
    emit('message', { text: '无效的环境标识，必须由字母、数字或划线组成', type: 'warning' })
    return
  }

  savingEnv.value = true
  try {
    const isEdit = envModalType.value === 'edit'
    const url = isEdit ? '/api/envs/edit' : '/api/envs/add'
    const submitConfig = isEdit ? {
      oldEnvKey: oldEnvKey.value,
      newEnvKey: cleanKey,
      config: {
        ...envForm.value,
        credentials: normalizeCredentialFields(envForm.value.credentials),
        local_port: envForm.value.local_port ? parseInt(envForm.value.local_port, 10) : ''
      }
    } : {
      envKey: cleanKey,
      config: {
        ...envForm.value,
        credentials: normalizeCredentialFields(envForm.value.credentials),
        local_port: envForm.value.local_port ? parseInt(envForm.value.local_port, 10) : ''
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitConfig)
    })
    const data = await res.json()
    if (res.ok) {
      emit('message', { text: data.message || '环境配置保存成功！', type: 'success' })
      visible.value = false
      emit('success')
    } else {
      emit('message', { text: data.error || '保存配置失败', type: 'error' })
    }
  } catch (err) {
    emit('message', { text: '网络连接失败: ' + err.message, type: 'error' })
  } finally {
    savingEnv.value = false
  }
}

const handleSubprojectChange = () => { envForm.value.credentials = normalizeCredentialFields(envForm.value.credentials) }
const handleCustomInput = () => { handleSubprojectChange() }

defineExpose({ show, hide, visible, showCredentialFieldModal })
</script>

<template>
  <div class="modal-overlay" v-if="visible" @click.self="hide">
    <div class="glass-card modal-content env-modal-content animate-zoom">
      <div class="modal-header">
        <h3>{{ envModalType === 'edit' ? '✏️ 修改环境配置' : '➕ 新增环境配置' }}</h3>
        <button class="btn-close" @click="hide">×</button>
      </div>
      <div class="modal-body">
        <div class="form-section">
          <h4 class="form-section-title">🔑 基本配置</h4>

          <div class="form-grid">
            <div class="form-group">
              <label>环境标识 (英文短名)</label>
              <input
                type="text"
                v-model="envForm.envKey"
                :disabled="envModalType === 'edit'"
                :placeholder="envModalType === 'edit' ? '不支持原地改名（请新建）' : '例如: dev, test'"
                class="form-control"
              />
            </div>

            <div class="form-group">
              <label>描述</label>
              <input type="text" v-model="envForm.company_name" placeholder="可选，例如: 客户服务" class="form-control" />
            </div>

            <div class="form-group">
              <label>线上地址</label>
              <input type="text" v-model="envForm.VUE_DEV_HOST" placeholder="可选，例如: http://dev.example.com" class="form-control" />
            </div>

            <div class="form-group">
              <label>本地开发端口 (可选)</label>
              <input type="number" v-model="envForm.local_port" placeholder="可选，自行启动环境填此端口以自动识别" class="form-control" />
            </div>

            <div class="form-group">
              <label>指定 Node 版本 (可选)</label>
              <input type="text" v-model="envForm.node_version" placeholder="例如: 16.17.0" class="form-control" />
            </div>

            <div class="form-group">
              <label>远程部署目录 (用于 Git 分支)</label>
              <input type="text" v-model="envForm.remote_dir" placeholder="可选，例如: /var/www/****" class="form-control" />
            </div>

            <div class="form-group">
              <label>本地环境启动命令 (可选)</label>
              <input type="text" v-model="envForm.start_cmd" placeholder="可选，例如: npm run dev" class="form-control" />
            </div>

            <div class="checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" v-model="envForm.disable_branch" />
                <span class="checkbox-text">🔒 禁用 Git 远程分支操作（如无 SSH 权限的线上环境）</span>
              </label>
            </div>

            <div class="checkbox-row">
              <label class="checkbox-label">
                <input type="checkbox" v-model="envForm.disable_start" />
                <span class="checkbox-text">🚫 禁用本地开发服务启动（如无需本地启动的线上环境）</span>
              </label>
            </div>
          </div>
        </div>

        <div class="form-section">
          <h4 class="form-section-title cred-title">
            <span>🔐 登录凭证 (Cookie / Token)</span>
            <button type="button" class="btn-add-cred" @click="showCredentialFieldModal = true">+ 添加字段</button>
          </h4>

          <div class="credential-fields-list" v-if="activeCredentialFields.length > 0">
            <div v-for="field in activeCredentialFields" :key="field.key" class="cred-row">
              <div class="cred-head">
                <span class="cred-key">{{ field.key }}</span>
                <span class="cred-tag" :class="field.inject_type">{{ field.inject_type }}</span>
                <button class="cred-del" @click="removeCredentialField(field.key)" title="移除此字段">✕</button>
              </div>
              <input v-model="field.value" type="text" :placeholder="`请输入 ${field.key} 的实际值...`" class="form-control cred-input" @input="handleCustomInput" />
            </div>
          </div>
          <div class="empty-credential-hint" v-else>
            <p>暂无凭证字段，点击右上角「+ 添加字段」添加。</p>
          </div>
        </div>


        <div class="form-section">
          <h4 class="form-section-title">
            <span>🌐 自动登录配置</span>
            <label class="section-toggle-label" @click="showAutoLoginSettings = !showAutoLoginSettings">
              <span class="toggle-text">{{ showAutoLoginSettings ? ' ▲' : ' ▼' }}</span>
            </label>
          </h4>

          <div v-if="showAutoLoginSettings" class="form-grid">
            <div class="form-group">
              <label>线上登录地址</label>
              <input type="text" v-model="envForm.login_url" placeholder="可选，例如: https://work.example.com/login" class="form-control" />
            </div>
            <div class="form-group">
              <label>线上账号</label>
              <input type="text" v-model="envForm.online_username" placeholder="可选，例如: test" class="form-control" />
            </div>
             <div class="form-group">
              <label>线上密码</label>
              <div class="password-wrapper">
                <input :type="showPassword ? 'text' : 'password'" v-model="envForm.online_password" placeholder="可选，密码将在本地以 AES-256 加密存储" class="form-control password-input" />
                <button type="button" class="btn-toggle-password" @click="showPassword = !showPassword" :title="showPassword ? '隐藏密码' : '显示密码'">
                  {{ showPassword ? '🙈' : '👁️' }}
                </button>
              </div>
            </div>
            <div class="form-group">
              <label>登录浏览器</label>
              <select v-model="envForm.login_browser" class="form-control login-browser-select">
                <option value="chrome">Chrome / Chromium</option>
                <option value="msedge">Microsoft Edge</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-mini btn-mini-cancel" @click="hide" :disabled="savingEnv">取消</button>
        <button class="btn-mini btn-mini-primary" @click="saveEnvConfig" :disabled="savingEnv">
          {{ savingEnv ? (envModalType === 'edit' ? '正在保存...' : '正在创建...') : (envModalType === 'edit' ? '确认保存' : '确认创建') }}
        </button>
      </div>
    </div>

    <!-- 自定义凭证字段弹出层 -->
    <div class="modal-overlay" v-if="showCredentialFieldModal" @click.self="showCredentialFieldModal = false">
      <div class="glass-card modal-content credential-field-modal animate-zoom">
        <div class="modal-header">
          <h3>➕ 新增自定义凭证字段</h3>
          <button class="btn-close" @click="showCredentialFieldModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>字段 Key 名称</label>
            <input type="text" v-model="credentialFieldForm.key" placeholder="例如: auth_code, token, corpid" class="form-control" />
          </div>
          <div class="form-group">
            <label>字段值</label>
            <input type="text" v-model="credentialFieldForm.value" placeholder="可选，保存后将加密存储" class="form-control" />
          </div>
          <div class="form-group">
            <label>注入方式</label>
            <select v-model="credentialFieldForm.inject_type" class="form-control">
              <option value="cookie">Cookie</option>
              <option value="localStorage">localStorage</option>
              <option value="sessionStorage">sessionStorage</option>
              <option value="header">Header</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-mini btn-mini-cancel" @click="showCredentialFieldModal = false">取消</button>
          <button class="btn-mini btn-mini-primary" @click="addCredentialField">确认新增</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 加宽弹窗 */
.env-modal-content {
  max-width: 720px !important;
  width: 92vw;
}

/* 一排两列布局 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}

.form-grid .form-group { margin-bottom: 0; }

/* 紧凑上下间距 */
.form-section {
  margin-bottom: 18px;
}

.form-section-title {
  margin: 0 0 12px 0;
}

.login-browser-select { font-size: 0.9rem; }

/* ---- 凭证区域 ---- */
.cred-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-add-cred {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--primary, #6366f1);
  background: transparent;
  color: var(--primary, #6366f1);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-add-cred:hover {
  background: var(--primary, #6366f1);
  color: #fff;
}

.credential-fields-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cred-row {
  border: 1px solid rgba(120, 120, 120, 0.15);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(120, 120, 120, 0.03);
}

.cred-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.cred-key {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.cred-tag {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
  text-transform: lowercase;
}
.cred-tag.localStorage { background: rgba(16, 185, 129, 0.12); color: #10b981; }
.cred-tag.sessionStorage { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
.cred-tag.header { background: rgba(236, 72, 153, 0.12); color: #ec4899; }

.cred-del {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}
.cred-del:hover { background: rgba(239, 68, 68, 0.12); color: #ef4444; }

.cred-input {
  width: 100%;
}

.empty-credential-hint {
  padding: 16px;
  text-align: center;
  border: 1px dashed rgba(120, 120, 120, 0.25);
  border-radius: 8px;
}
.empty-credential-hint p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

/* 密码切换查看样式 */
.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.password-input {
  padding-right: 38px !important;
  width: 100%;
}

.btn-toggle-password {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  line-height: 1;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.btn-toggle-password:hover {
  opacity: 1;
}



@media (max-width: 560px) {
  .form-grid { grid-template-columns: 1fr; }
}

.checkbox-row {
  grid-column: span 2;
  display: flex;
  align-items: center;
  margin-top: 6px;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.checkbox-text {
  font-size: 12.5px;
  color: var(--text);
}
</style>
