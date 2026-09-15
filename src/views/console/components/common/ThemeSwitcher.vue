<script setup>
/**
 * @file ThemeSwitcher.vue
 * @description 客户端主题切换胶囊组件，支持切换亮色、暗色和跟随系统，并分发双向绑定的更新事件
 */
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
      <svg class="tab-svg" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="12" height="8" rx="1.5"/>
        <path d="M5 14h6M8 11v3"/>
      </svg>
      <span>自动</span>
    </button>
    <button 
      class="theme-tab-btn" 
      :class="{ active: modelValue === 'light' }" 
      @click="selectTheme('light')"
      title="亮色模式"
    >
      <svg class="tab-svg" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <circle cx="8" cy="8" r="3"/>
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>
      </svg>
      <span>亮色</span>
    </button>
    <button 
      class="theme-tab-btn" 
      :class="{ active: modelValue === 'dark' }" 
      @click="selectTheme('dark')"
      title="暗色模式"
    >
      <svg class="tab-svg" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13.2 9.8A6 6 0 1 1 6.2 2.8 5 5 0 0 0 13.2 9.8z"/>
      </svg>
      <span>暗色</span>
    </button>
  </div>
</template>

<style scoped>
.theme-switcher-capsule {
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-pill, 9999px);
  padding: 3px;
  gap: 2px;
  box-sizing: border-box;
}

[data-theme="dark"] .theme-switcher-capsule {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.theme-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  border-radius: var(--radius-pill, 9999px);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  line-height: 1;
}

.theme-tab-btn:hover:not(.active) {
  color: var(--text, #111827);
  background: rgba(0, 0, 0, 0.03);
}

[data-theme="dark"] .theme-tab-btn:hover:not(.active) {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.04);
}

.theme-tab-btn.active {
  background: var(--surface, #ffffff);
  color: var(--text, #111827);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.06);
  font-weight: 600;
}

[data-theme="dark"] .theme-tab-btn.active {
  background: #2c2c2e;
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.tab-svg {
  flex-shrink: 0;
  opacity: 0.85;
}

.theme-tab-btn.active .tab-svg {
  opacity: 1;
}
</style>
