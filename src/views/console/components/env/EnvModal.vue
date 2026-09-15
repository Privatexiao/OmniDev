<script setup>
/**
 * @file EnvModal.vue
 * @description 环境配置登记与编辑模态框组件，支持录入环境标识、自定义开发启动命令、管理多平台免密凭证结构以及配置一键线上登录参数
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
  local_login_path: '',
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
      local_login_path: config.local_login_path || '',
      node_version: config.node_version || '',
      start_cmd: config.start_cmd || '',
      login_url: config.login_url || '',
      online_username: config.online_username || '',
      online_password: config.online_password || '',
      login_browser: config.login_browser || 'chrome',
      disable_branch: !!config.disable_branch,
      disable_start: !!config.disable_start
    }
    // 一键登录配置如果有内容不为空直接展开即可
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

const handleOverlayClick = () => {
  if (props.closeOnOverlayClick) {
    hide()
  }
}

const handleCredentialFieldOverlayClick = () => {
  if (props.closeOnOverlayClick) {
    showCredentialFieldModal.value = false
  }
}

const activeCredentialFields = computed(() =>
  Array.isArray(envForm.value.credentials) ? envForm.value.credentials : normalizeCredentialFields(envForm.value.credentials)
)

const normalizeCredentialFields = (raw) => {
  if (Array.isArray(raw)) {
    return raw.filter(item => item && item.key).map(item => ({
      key: String(item.key || '').trim(),
      value: item.value || '',
      inject_type: item.inject_type || 'cookie',
      enabled: item.enabled !== false
    }))
  }
  return Object.entries(raw || {}).map(([key, val]) => {
    if (val && typeof val === 'object' && 'key' in val) {
      return { key: String(val.key || '').trim(), value: val.value || '', inject_type: val.inject_type || 'cookie', enabled: val.enabled !== false }
    }
    return { key: String(key || '').trim(), value: val || '', inject_type: 'cookie', enabled: true }
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
    inject_type: credentialFieldForm.value.inject_type || 'cookie',
    enabled: true
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
  <div class="modal-overlay" v-if="visible" @click.self="handleOverlayClick">
    <div class="glass-card modal-content env-modal-content animate-zoom">
      <!-- 模态框 Header 区域 (极简高质感 负字距 + 矢量徽章) -->
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-box" :class="envModalType">
            <svg v-if="envModalType === 'edit'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <div class="header-title-wrap">
            <h3 class="modal-title">
              {{ envModalType === 'edit' ? '修改环境配置' : '新增环境配置' }}
              <span v-if="envModalType === 'edit' && oldEnvKey" class="env-badge-pill">{{ oldEnvKey }}</span>
            </h3>
            <p class="modal-desc">{{ envModalType === 'edit' ? '调整工作区运行环境的本地端口、启动指令与登录凭证' : '在当前工作区注册新的运行环境并配置运行参数' }}</p>
          </div>
        </div>
        <button class="btn-close press-spring" @click="hide" title="关闭窗口">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- 1. 基础配置分段卡片 -->
        <div class="form-section">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>基础配置</span>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">环境标识 (英文短名)</label>
              <input
                type="text"
                v-model="envForm.envKey"
                :disabled="envModalType === 'edit'"
                :placeholder="envModalType === 'edit' ? '不支持原地改名（请新建）' : '例如: dev, test'"
                class="form-control"
              />
            </div>

            <div class="form-group">
              <label class="form-label">描述</label>
              <input type="text" v-model="envForm.company_name" placeholder="可选，例如: 客户服务" class="form-control" />
            </div>

            <div class="form-group full-width-span">
              <label class="form-label">线上地址</label>
              <input type="text" v-model="envForm.VUE_DEV_HOST" placeholder="可选，例如: http://dev.example.com" class="form-control" />
            </div>
          </div>
        </div>

        <!-- 2. 本地开发与登录凭证配置分段卡片 -->
        <div class="form-section">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>本地开发与启动配置</span>
            </div>
            <span class="section-pill-tag">开发环境</span>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">本地开发端口</label>
              <input type="number" v-model="envForm.local_port" placeholder="不填自动分配，填写后自动探测运行态" class="form-control" />
            </div>

            <div class="form-group">
              <label class="form-label">本地登录路径</label>
              <input type="text" v-model="envForm.local_login_path" placeholder="默认：/#/ 或 /h5/dist/#/home" class="form-control" />
            </div>

            <div class="form-group">
              <label class="form-label">本地启动命令</label>
              <input type="text" v-model="envForm.start_cmd" placeholder="默认：npm run dev" class="form-control" />
            </div>

            <div class="form-group">
              <label class="form-label">指定 Node 版本</label>
              <input type="text" v-model="envForm.node_version" placeholder="默认：16.17.0" class="form-control" />
            </div>

            <div class="checkbox-row full-width-span">
              <label class="form-checkbox-label">
                <input type="checkbox" v-model="envForm.disable_start" class="form-checkbox" />
                <span class="checkbox-box">
                  <svg class="check-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span class="checkbox-text">禁用本地开发服务启动（如无需本地启动构建的纯线上环境）</span>
              </label>
            </div>
          </div>

          <!-- 登录凭证二级区域 (高质感 Callout + 微卡片凭据组) -->
          <div class="credential-subsection">
            <div class="cred-title-row">
              <div class="cred-sub-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>免密登录凭据 (Cookie / Token)</span>
              </div>
              <button type="button" class="btn-add-cred press-spring" @click="showCredentialFieldModal = true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>添加字段</span>
              </button>
            </div>

            <div class="callout-card">
              <svg class="callout-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <div class="callout-text">
                项目启动时若浏览器自动打开，受跨源安全策略限制可能未及时注入凭证。此时可点击列表中对应的 <b>「登录本地端口」</b> 按钮，以完成免密凭证的精确注入。
              </div>
            </div>

            <div class="credential-fields-list" v-if="activeCredentialFields.length > 0">
              <div v-for="field in activeCredentialFields" :key="field.key" class="cred-row">
                <div class="cred-head">
                  <label class="form-checkbox-label" title="启用/禁用此凭据字段">
                    <input type="checkbox" v-model="field.enabled" class="form-checkbox" @change="handleCustomInput" />
                    <span class="checkbox-box mini">
                      <svg class="check-icon" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  </label>
                  <span class="cred-key" :class="{ 'cred-disabled-text': field.enabled === false }">{{ field.key }}</span>
                  <span class="cred-tag-pill" :class="[field.inject_type, { 'cred-disabled-tag': field.enabled === false }]">{{ field.inject_type }}</span>
                  <button class="cred-del press-spring" @click="removeCredentialField(field.key)" title="移除此字段">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <input
                  v-model="field.value"
                  type="text"
                  :disabled="field.enabled === false"
                  :placeholder="field.enabled === false ? '该凭证字段已禁用' : `请输入 ${field.key} 的实际值...`"
                  class="form-control cred-input"
                  :class="{ 'cred-input-disabled': field.enabled === false }"
                  @input="handleCustomInput"
                />
              </div>
            </div>
            <div class="empty-credential-hint" v-else>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <p>暂无自定义免密凭证字段，点击上方「添加字段」录入 Token 或 Cookie</p>
            </div>
          </div>
        </div>

        <!-- 3. 远程部署配置分段卡片 -->
        <div class="form-section">
          <div class="section-header">
            <div class="section-title">
              <svg class="section-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                <path d="M12 12v9"></path>
                <path d="m8 17 4 4 4-4"></path>
              </svg>
              <span>远程部署配置</span>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group full-width-span">
              <label class="form-label">远程部署目录 (用于 Git 分支)</label>
              <input type="text" v-model="envForm.remote_dir" placeholder="可选，例如: /var/www/****" class="form-control" />
            </div>

            <div class="checkbox-row full-width-span">
              <label class="form-checkbox-label">
                <input type="checkbox" v-model="envForm.disable_branch" class="form-checkbox" />
                <span class="checkbox-box">
                  <svg class="check-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span class="checkbox-text">禁用 Git 远程分支操作（如无 SSH 权限的线上只读环境）</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 4. 一键登录配置分段卡片 (可折叠手风琴) -->
        <div class="form-section form-section-collapsible" :class="{ 'is-expanded': showAutoLoginSettings }">
          <div class="section-header clickable press-spring" @click="showAutoLoginSettings = !showAutoLoginSettings">
            <div class="section-title">
              <svg class="section-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>一键免密登录配置</span>
            </div>
            <div class="section-expand-btn">
              <span class="toggle-hint-text">{{ showAutoLoginSettings ? '收起配置' : '展开配置' }}</span>
              <svg class="chevron-icon" :class="{ 'rotate-180': showAutoLoginSettings }" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          <div v-if="showAutoLoginSettings" class="form-grid section-expand-content">
            <div class="form-group full-width-span">
              <label class="form-label">线上登录地址</label>
              <input type="text" v-model="envForm.login_url" placeholder="可选，例如: https://work.example.com/login" class="form-control" />
            </div>
            <div class="form-group">
              <label class="form-label">线上账号</label>
              <input type="text" v-model="envForm.online_username" placeholder="可选，例如: test" class="form-control" />
            </div>
            <div class="form-group">
              <label class="form-label">线上密码</label>
              <div class="password-wrapper">
                <input
                  :type="showPassword ? 'text' : 'password'"
                  v-model="envForm.online_password"
                  placeholder="可选，将在本地以 AES-256 安全加密存储"
                  class="form-control password-input"
                />
                <button type="button" class="btn-toggle-password press-spring" @click="showPassword = !showPassword" :title="showPassword ? '隐藏密码' : '显示密码'">
                  <svg v-if="!showPassword" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div class="form-group full-width-span">
              <label class="form-label">登录浏览器</label>
              <select v-model="envForm.login_browser" class="form-control login-browser-select">
                <option value="chrome">Chrome / Chromium</option>
                <option value="msedge">Microsoft Edge</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- 模态框 Footer 胶囊按钮体系 (极简高质感 980px Pill + 物理弹性) -->
      <div class="modal-footer">
        <button class="btn-pill-secondary press-spring" @click="hide" :disabled="savingEnv">取消</button>
        <button class="btn-pill-primary press-spring" @click="saveEnvConfig" :disabled="savingEnv">
          <svg v-if="savingEnv" class="spinner-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
          <span>{{ savingEnv ? (envModalType === 'edit' ? '正在保存...' : '正在创建...') : (envModalType === 'edit' ? '保存更改' : '确认创建') }}</span>
        </button>
      </div>
    </div>

    <!-- 自定义凭证字段弹出层 (极简高质感 嵌套微模态框) -->
    <div class="modal-overlay sub-modal-overlay" v-if="showCredentialFieldModal" @click.self="handleCredentialFieldOverlayClick">
      <div class="glass-card modal-content credential-field-modal animate-zoom">
        <div class="modal-header">
          <div class="header-left">
            <div class="header-icon-box add">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <div class="header-title-wrap">
              <h3 class="modal-title">新增免密凭证字段</h3>
              <p class="modal-desc">录入需自动注入浏览器的自定义存储项</p>
            </div>
          </div>
          <button class="btn-close press-spring" @click="showCredentialFieldModal = false" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">字段键名 (Key)</label>
            <input type="text" v-model="credentialFieldForm.key" placeholder="例如: auth_code, token, corpid" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">初始凭证值 (Value)</label>
            <input type="text" v-model="credentialFieldForm.value" placeholder="可选，后续在环境卡片中可随时更新" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">注入存储类型</label>
            <select v-model="credentialFieldForm.inject_type" class="form-control">
              <option value="cookie">Cookie (浏览器 Cookie)</option>
              <option value="localStorage">localStorage (本地持久存储)</option>
              <option value="sessionStorage">sessionStorage (会话临时存储)</option>
              <option value="header">Header (请求头)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-pill-secondary press-spring" @click="showCredentialFieldModal = false">取消</button>
          <button class="btn-pill-primary press-spring" @click="addCredentialField">确认新增</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================
   极简高质感环境配置模态框规范
   ========================================== */

/* 弹窗主体尺寸与圆角 */
.env-modal-content {
  max-width: 680px !important;
  width: 94vw;
  border-radius: var(--radius-card, 20px);
}

.credential-field-modal {
  max-width: 440px !important;
  width: 92vw;
  border-radius: 18px;
}

/* 模态框 Header 区域 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-box {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-icon-box.edit {
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .header-icon-box.edit {
  background: rgba(41, 151, 255, 0.15);
  color: #2997ff;
}

.header-icon-box.add {
  background: rgba(52, 199, 89, 0.1);
  color: var(--success, #34c759);
}

[data-theme="dark"] .header-icon-box.add {
  background: rgba(50, 215, 75, 0.15);
  color: #32d74b;
}

.header-title-wrap {
  display: flex;
  flex-direction: column;
}

.modal-title {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 650;
  color: var(--text);
  letter-spacing: var(--tracking-title, -0.022em);
  display: flex;
  align-items: center;
  gap: 8px;
}

.env-badge-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
  border: 1px solid rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .env-badge-pill {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.modal-desc {
  margin: 3px 0 0 0;
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: var(--tracking-body, -0.006em);
}

.btn-close {
  background: rgba(0, 0, 0, 0.04);
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

[data-theme="dark"] .btn-close {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
}

.btn-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}

[data-theme="dark"] .btn-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

/* 模态框 Body 与分段卡片 */
.modal-body {
  padding: 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  overflow-y: auto;
}

.form-section {
  background: rgba(0, 0, 0, 0.016);
  border: 1px solid rgba(0, 0, 0, 0.045);
  border-radius: 14px;
  padding: 14px 16px;
  transition: border-color 0.2s ease;
}

[data-theme="dark"] .form-section {
  background: rgba(255, 255, 255, 0.022);
  border-color: rgba(255, 255, 255, 0.05);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header.clickable {
  cursor: pointer;
  user-select: none;
  margin-bottom: 0;
  padding: 2px 0;
}

.form-section-collapsible.is-expanded .section-header.clickable {
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
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

.section-pill-tag {
  font-size: 10.5px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .section-pill-tag {
  background: rgba(41, 151, 255, 0.15);
  color: #2997ff;
}

.section-expand-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
}

.toggle-hint-text {
  font-size: 11px;
}

.chevron-icon {
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.rotate-180 {
  transform: rotate(180deg);
}

/* 表单栅格与输入框 (微凹槽与微光聚焦) */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}

.full-width-span {
  grid-column: span 2;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 0;
}

.form-label {
  font-size: 11.5px;
  font-weight: 550;
  color: var(--text-secondary, #6e6e73);
  letter-spacing: var(--tracking-body, -0.006em);
}

.form-control {
  width: 100%;
  padding: 8px 11px;
  font-size: 12.5px;
  letter-spacing: var(--tracking-body, -0.006em);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.035);
  color: var(--text);
  box-sizing: border-box;
  outline: none;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .form-control {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.045);
}

.form-control:focus {
  background: var(--surface, #ffffff);
  border-color: var(--color-brand, #0066cc);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.14);
}

[data-theme="dark"] .form-control:focus {
  background: #24252c;
  border-color: #2997ff;
  box-shadow: 0 0 0 3px rgba(41, 151, 255, 0.2);
}

.form-control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .form-control:disabled {
  background: rgba(255, 255, 255, 0.02);
}

.login-browser-select {
  font-size: 12px;
  cursor: pointer;
}

/* 极简高质感风格复选框体系 */
.checkbox-row {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.form-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
}

.form-checkbox {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.checkbox-box {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.2px solid rgba(0, 0, 0, 0.22);
  background: rgba(0, 0, 0, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

[data-theme="dark"] .checkbox-box {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.04);
}

.checkbox-box.mini {
  width: 13.5px;
  height: 13.5px;
  border-radius: 3.5px;
}

.checkbox-box .check-icon {
  opacity: 0;
  transform: scale(0.6);
  color: #ffffff;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.form-checkbox:checked + .checkbox-box {
  background: var(--color-brand, #0066cc);
  border-color: var(--color-brand, #0066cc);
}

[data-theme="dark"] .form-checkbox:checked + .checkbox-box {
  background: #2997ff;
  border-color: #2997ff;
}

.form-checkbox:checked + .checkbox-box .check-icon {
  opacity: 1;
  transform: scale(1);
}

.checkbox-text {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 🍎 高质感 Callout 提示条 */
.callout-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(0, 102, 204, 0.04);
  border: 1px solid rgba(0, 102, 204, 0.12);
  border-radius: 10px;
  padding: 9px 12px;
  margin-bottom: 12px;
}

[data-theme="dark"] .callout-card {
  background: rgba(41, 151, 255, 0.08);
  border-color: rgba(41, 151, 255, 0.18);
}

.callout-icon {
  color: var(--color-brand, #0066cc);
  margin-top: 1px;
  flex-shrink: 0;
}

[data-theme="dark"] .callout-icon {
  color: #2997ff;
}

.callout-text {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.callout-text b {
  color: var(--color-brand, #0066cc);
  font-weight: 600;
}

[data-theme="dark"] .callout-text b {
  color: #2997ff;
}

/* 凭据二级配置区域 */
.credential-subsection {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .credential-subsection {
  border-top-color: rgba(255, 255, 255, 0.05);
}

.cred-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.cred-sub-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.btn-add-cred {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 102, 204, 0.08);
  border: 1px solid rgba(0, 102, 204, 0.16);
  color: var(--color-brand, #0066cc);
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .btn-add-cred {
  background: rgba(41, 151, 255, 0.15);
  border-color: rgba(41, 151, 255, 0.25);
  color: #2997ff;
}

.btn-add-cred:hover {
  background: var(--color-brand, #0066cc);
  color: #ffffff;
}

[data-theme="dark"] .btn-add-cred:hover {
  background: #2997ff;
  color: #ffffff;
}

.credential-fields-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cred-row {
  background: var(--panel-bg, #ffffff);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  padding: 8px 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

[data-theme="dark"] .cred-row {
  background: #1f2027;
  border-color: rgba(255, 255, 255, 0.06);
}

.cred-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.cred-key {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.cred-tag-pill {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: var(--radius-pill, 980px);
  background: rgba(0, 102, 204, 0.08);
  color: var(--color-brand, #0066cc);
  text-transform: lowercase;
}

.cred-tag-pill.localStorage {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.cred-tag-pill.sessionStorage {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.cred-tag-pill.header {
  background: rgba(175, 82, 222, 0.1);
  color: #af52de;
}

.cred-del {
  margin-left: auto;
  background: transparent;
  border: none;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.cred-del:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.cred-input {
  width: 100%;
}

.cred-disabled-text {
  text-decoration: line-through;
  opacity: 0.5;
}

.cred-disabled-tag {
  opacity: 0.5;
  background: rgba(120, 120, 120, 0.12) !important;
  color: var(--text-muted) !important;
}

.cred-input-disabled {
  opacity: 0.6;
  background-color: rgba(120, 120, 120, 0.05) !important;
  cursor: not-allowed;
}

.empty-credential-hint {
  padding: 18px;
  text-align: center;
  border: 1px dashed rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

[data-theme="dark"] .empty-credential-hint {
  border-color: rgba(255, 255, 255, 0.08);
}

.empty-credential-hint .empty-icon {
  color: var(--text-muted);
  opacity: 0.6;
}

.empty-credential-hint p {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted);
}

/* 密码显隐按钮 */
.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.password-input {
  padding-right: 36px !important;
  width: 100%;
}

.btn-toggle-password {
  position: absolute;
  right: 7px;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.15s ease;
}

.btn-toggle-password:hover {
  color: var(--text);
  background: rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .btn-toggle-password:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* 模态框 Footer 与 高质感 胶囊按钮体系 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  background: rgba(0, 0, 0, 0.015);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .modal-footer {
  background: rgba(255, 255, 255, 0.015);
  border-top-color: rgba(255, 255, 255, 0.05);
}

.btn-pill-secondary {
  border-radius: var(--radius-pill, 980px);
  padding: 7px 18px;
  font-size: 12.5px;
  font-weight: 550;
  background: rgba(0, 0, 0, 0.045);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: var(--text);
  cursor: pointer;
  outline: none;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .btn-pill-secondary {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.btn-pill-secondary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.075);
}

[data-theme="dark"] .btn-pill-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.13);
}

.btn-pill-primary {
  border-radius: var(--radius-pill, 980px);
  padding: 7px 20px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  background: var(--color-brand, #0066cc);
  border: 1px solid transparent;
  color: #ffffff;
  cursor: pointer;
  outline: none;
  box-shadow: 0 2px 6px rgba(0, 102, 204, 0.28);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .btn-pill-primary {
  background: #2997ff;
  box-shadow: 0 2px 6px rgba(41, 151, 255, 0.35);
}

.btn-pill-primary:hover:not(:disabled) {
  background: var(--color-brand-hover, #0077ed);
  box-shadow: 0 4px 10px rgba(0, 102, 204, 0.35);
}

[data-theme="dark"] .btn-pill-primary:hover:not(:disabled) {
  background: #47a7ff;
  box-shadow: 0 4px 12px rgba(41, 151, 255, 0.45);
}

.btn-pill-primary:disabled,
.btn-pill-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .full-width-span {
    grid-column: span 1;
  }
}
</style>
