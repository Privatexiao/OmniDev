<script setup>
/**
 * @file BranchSwitchModal.vue
 * @description 远程环境分支切换输入模态框，基于 Promise 式的调用封装，用于接收用户输入的目标分支名称并安全切换
 */
import { ref, nextTick } from 'vue'
import Modal from '../../../../components/Modal.vue'

const modalRef = ref(null)
const title = ref('')
const value = ref('')
const placeholder = ref('')
const inputRef = ref(null)

// 采用 Promise 封装，支持 await 同步体验
let resolvePromise = null

const show = (options = {}) => {
  title.value = options.title || '切换分支'
  value.value = options.defaultValue || ''
  placeholder.value = options.placeholder || '输入目标分支名称...'
  
  // 1. 调用底层通用骨架的 show()
  if (modalRef.value) {
    modalRef.value.show()
  }
  
  // 2. 自动获取焦点并全选
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.select()
    }
  })

  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

const handleConfirm = () => {
  if (resolvePromise) {
    resolvePromise(value.value.trim())
  }
  if (modalRef.value) {
    modalRef.value.hide()
  }
}

const handleCancel = () => {
  if (resolvePromise) {
    resolvePromise(null)
  }
}

// 暴露规范定义的标准接口
defineExpose({
  show,
  setData(data) {
    value.value = data
  },
  getData() {
    return value.value
  }
})
</script>

<template>
  <Modal 
    ref="modalRef" 
    :title="title" 
    @confirm="handleConfirm" 
    @cancel="handleCancel"
  >
    <template #icon>
      <div class="header-icon-box brand">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
      </div>
    </template>

    <div class="branch-modal-body">
      <div class="form-group">
        <label class="form-label">目标分支标识</label>
        <input 
          ref="inputRef"
          v-model="value" 
          type="text" 
          :placeholder="placeholder" 
          class="form-control" 
          @keyup.enter="handleConfirm"
        />
        <p class="form-help">请输入 Git 远端已存在的有效分支名称，确认后将在指定工作目录下执行安全检出。</p>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.branch-modal-body {
  width: 100%;
}
</style>
