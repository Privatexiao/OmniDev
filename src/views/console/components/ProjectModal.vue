<script setup>
import { ref, watch } from 'vue'

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
  <div class="modal-overlay" v-if="visible" @click.self="hide">
    <div class="glass-card modal-content animate-zoom">
      <div class="modal-header">
        <h3>{{ mode === 'edit' ? '✏️ 修改项目分支配置' : '➕ 登记新项目分支' }}</h3>
        <button class="btn-close" @click="hide">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>项目名称</label>
          <input 
            type="text" 
            v-model="projectName" 
            placeholder="请输入您的项目名称..." 
            class="form-control"
          />
        </div>
        <div class="form-group">
          <label>项目工作目录绝对路径</label>
          <input
            type="text"
            v-model="projectPath"
            placeholder="请输入项目工作目录在本地磁盘的绝对路径..."
            class="form-control"
          />
          <p class="form-help">填什么路径，启动与终端就在该目录下执行，系统不再追加任何子目录。</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-mini btn-mini-cancel" @click="hide" :disabled="loading">
          取消
        </button>
        <button class="btn-mini btn-mini-primary" @click="save" :disabled="loading">
          {{ loading ? (mode === 'edit' ? '正在保存...' : '正在登记...') : (mode === 'edit' ? '确认保存' : '确认登记') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 继承主控制台的样式逻辑，使用 scoped 隔离保护 */
</style>
