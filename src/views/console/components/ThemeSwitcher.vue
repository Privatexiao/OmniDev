<script setup>
// 声明 Props 并指定 Type 与 Default 默认值
defineProps({
  modelValue: {
    type: String,
    default: 'light'
  }
})

// 声明事件分发
const emit = defineEmits(['update:modelValue'])

// 选择主题方法
const selectTheme = (mode) => {
  emit('update:modelValue', mode)
}
</script>

<template>
  <div class="theme-switcher-capsule">
    <button 
      class="theme-tab-btn" 
      :class="{ active: modelValue === 'auto' }" 
      @click="selectTheme('auto')"
      title="跟随系统"
    >
      💻 自动
    </button>
    <button 
      class="theme-tab-btn" 
      :class="{ active: modelValue === 'light' }" 
      @click="selectTheme('light')"
      title="亮色模式"
    >
      ☀️ 亮色
    </button>
    <button 
      class="theme-tab-btn" 
      :class="{ active: modelValue === 'dark' }" 
      @click="selectTheme('dark')"
      title="暗色模式"
    >
      🌙 暗色
    </button>
  </div>
</template>
