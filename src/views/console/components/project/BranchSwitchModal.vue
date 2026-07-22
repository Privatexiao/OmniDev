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
  <!-- 🌿 引入通用 Modal 骨架底座，并将确认、取消事件与业务层绑定 -->
  <Modal 
    ref="modalRef" 
    :title="title" 
    @confirm="handleConfirm" 
    @cancel="handleCancel"
  >
    <!-- 分支输入特化内容（填入默认插槽） -->
    <div class="branch-modal-body">
      <input 
        ref="inputRef"
        v-model="value" 
        type="text" 
        :placeholder="placeholder" 
        class="modal-input" 
        @keyup.enter="handleConfirm"
      />
    </div>
  </Modal>
</template>

<style scoped>
.branch-modal-body {
  width: 100%;
}

.modal-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: 11px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  outline: none;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
}

[data-theme="dark"] .modal-input {
  background: rgba(30, 41, 59, 0.75);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.modal-input:focus {
  border-color: #3b82f6;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
}

[data-theme="dark"] .modal-input:focus {
  background: rgba(30, 41, 59, 0.9);
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28);
}
</style>
