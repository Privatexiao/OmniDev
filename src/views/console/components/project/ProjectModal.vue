<script setup>
/**
 * @file ProjectModal.vue
 * @description 项目分支登记/编辑模态框，用于新增登记本地项目或修改已有项目的物理工作路径与名称
 */
import { ref, watch } from 'vue'

const props = defineProps({
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['success', 'message'])

const visible = ref(false)
const mode = ref('add') // 'add' | 'edit'
const projectId = ref('')
const projectName = ref('')
const projectPath = ref('')
const loading = ref(false)

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

// 🚀 暴露标准 show 方法，支持传入当前模式与回显数据
const show = (targetMode, proj = null) => {
  mode.value = targetMode
  if (targetMode === 'edit' && proj) {
    projectId.value = proj.id
    projectName.value = proj.name
    projectPath.value = proj.path
  } else {
    projectId.value = ''
    projectName.value = ''
    projectPath.value = ''
  }
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

// 🚀 一键登记或保存项目分支配置
const save = async () => {
  if (!projectName.value.trim() || !projectPath.value.trim()) {
    emit('message', { text: '请填写完整的项目名称与本地物理路径', type: 'warning' })
    return
  }
  loading.value = true
  try {
    const isEdit = mode.value === 'edit'
    const url = isEdit ? '/api/projects/edit' : '/api/projects/add'
    const bodyPayload = isEdit ? {
      id: projectId.value,
      name: projectName.value,
      path: projectPath.value
    } : {
      name: projectName.value,
      path: projectPath.value
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    })
    const data = await res.json()
    if (res.ok) {
      if (data.warning) {
        emit('message', { text: `${data.message}\n\n提示: ${data.warning}`, type: 'warning' })
      } else {
        emit('message', { text: data.message, type: 'success' })
      }
      visible.value = false
      emit('success')
    } else {
      emit('message', { text: data.error || (isEdit ? '保存项目修改失败' : '登记项目分支失败'), type: 'error' })
    }
  } catch (err) {
    emit('message', { text: '连接控制端失败: ' + err.message, type: 'error' })
  } finally {
    loading.value = false
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
    <div class="glass-card modal-content animate-zoom">
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-box brand">
            <svg v-if="mode === 'edit'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </div>
          <div class="header-title-wrap">
            <h3 class="modal-title">{{ mode === 'edit' ? '修改项目配置' : '登记新项目' }}</h3>
            <p class="modal-desc">{{ mode === 'edit' ? '更新项目展示名称或物理工作目录' : '在工作区绑定新的本地物理目录' }}</p>
          </div>
        </div>
        <button class="btn-close press-spring" @click="hide" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">项目名称</label>
          <input 
            type="text" 
            v-model="projectName" 
            placeholder="例如: 微客 CRM 前端、AI 工作流后台..." 
            class="form-control"
          />
        </div>
        <div class="form-group">
          <label class="form-label">项目工作目录绝对路径</label>
          <input
            type="text"
            v-model="projectPath"
            placeholder="例如: E:\projects\wweike-crm-fe"
            class="form-control"
          />
          <p class="form-help">开发启动与 Git 终端均在该物理目录下就地执行，系统不会追加多余子目录。</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-pill-secondary press-spring" @click="hide" :disabled="loading">
          取消
        </button>
        <button class="btn-pill-primary press-spring" @click="save" :disabled="loading">
          <svg v-if="loading" class="spinner-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
          <span>{{ loading ? (mode === 'edit' ? '正在保存...' : '正在登记...') : (mode === 'edit' ? '保存配置' : '确认登记') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
