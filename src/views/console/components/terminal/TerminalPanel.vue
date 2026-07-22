<script setup>
/**
 * @file TerminalPanel.vue
 * @description 抽屉式终端控制面板，支持收起/展开面板、本地及远程终端切换以及全屏放大调试终端的弹窗联动
 */
import { ref, watch, onMounted } from 'vue'
import TerminalView from './TerminalView.vue'

// 声明 Props 验证
const props = defineProps({
  logs: {
    type: String,
    default: ''
  },
  envs: {
    type: Object,
    default: () => ({})
  },
  currentEnv: {
    type: String,
    default: ''
  },
  modelValue: {
    type: String,
    default: ''
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  activeSubproject: {
    type: String,
    default: 'all'
  },
  isSSHConnected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'clearLogs',
  'message',
  'refreshLogs',
  'typeChange',
  'collapseChange'
])

const isCollapsed = ref(true)
const isPopupShow = ref(false)

const togglePanel = () => {
  isCollapsed.value = !isCollapsed.value
}

const selectTerminalType = (type) => {
  emit('typeChange', type)
}

onMounted(() => {
  const saved = localStorage.getItem('terminal_collapsed')
  if (saved !== null) {
    isCollapsed.value = saved === 'true'
  }
  emit('typeChange', 'remote')
})

watch(isCollapsed, (newVal) => {
  localStorage.setItem('terminal_collapsed', String(newVal))
  emit('collapseChange', newVal)
})
</script>

<template>
  <div class="glass-card console-panel" :class="{ 'is-collapsed': isCollapsed }">
    <!-- 极其精美的侧边悬浮拉手/拉条按钮（合并版） -->
    <button 
      class="terminal-toggle-tab" 
      :class="{ 'active-tab': !isCollapsed }"
      @click="togglePanel" 
      :title="!isCollapsed ? '收起开发控制台' : '展开开发控制台'"
    >
      <span class="toggle-icon">◀</span>
      <div class="toggle-text">
        <span>开</span>
        <span>发</span>
        <span>控</span>
        <span>制</span>
        <span>台</span>
      </div>
    </button>

    <!-- 主终端面板视图 -->
    <TerminalView
      v-bind="props"
      @update:modelValue="val => emit('update:modelValue', val)"
      @clearLogs="emit('clearLogs')"
      @message="msg => emit('message', msg)"
      @refreshLogs="emit('refreshLogs')"
      @typeChange="selectTerminalType"
      @popup="isPopupShow = true"
    />
  </div>

  <!-- 全屏放大终端弹窗遮罩 -->
  <div class="terminal-popup-overlay" v-if="isPopupShow" @click.self="isPopupShow = false">
    <div class="glass-card terminal-popup-content animate-zoom">
      <TerminalView
        v-bind="props"
        :isPopup="true"
        @update:modelValue="val => emit('update:modelValue', val)"
        @clearLogs="emit('clearLogs')"
        @message="msg => emit('message', msg)"
        @refreshLogs="emit('refreshLogs')"
        @typeChange="selectTerminalType"
        @closePopup="isPopupShow = false"
      />
    </div>
  </div>
</template>

<style scoped>
@import "./TerminalPanel.css";
</style>
