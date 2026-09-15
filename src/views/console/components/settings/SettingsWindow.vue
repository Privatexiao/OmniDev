<script setup>
/**
 * @file SettingsWindow.vue
 * @description 系统设置窗口行为面板，用于配置客户端关闭时的默认行为（询问/托盘最小化/彻底退出）及资源释放选项
 */
import { computed } from 'vue'

const props = defineProps({
  appCloseBehavior: {
    type: String,
    default: 'ask'
  },
  killEnvsOnClose: {
    type: Boolean,
    default: false
  },
  killServerOnClose: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'update:appCloseBehavior',
  'update:killEnvsOnClose',
  'update:killServerOnClose'
])

const localCloseBehavior = computed({
  get: () => props.appCloseBehavior,
  set: (val) => emit('update:appCloseBehavior', val)
})

const localKillEnvs = computed({
  get: () => props.killEnvsOnClose,
  set: (val) => emit('update:killEnvsOnClose', val)
})

const localKillServer = computed({
  get: () => props.killServerOnClose,
  set: (val) => emit('update:killServerOnClose', val)
})
</script>

<template>
  <div class="animate-fade-in settings-section">
    <div class="settings-header">
      <h4 class="settings-title">窗口关闭行为偏好</h4>
      <p class="settings-desc">设定点击控制台客户端右上角关闭按钮时的默认系统行为</p>
    </div>
    <div class="radio-group">
      <label class="radio-card" :class="{ active: localCloseBehavior === 'ask' }">
        <input type="radio" v-model="localCloseBehavior" value="ask" />
        <span class="radio-label">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M6.5 6a1.5 1.5 0 0 1 2.8.7c0 .8-.8 1.1-1.3 1.5v.6M8 11.5h.01"/></svg>
          <span>每次询问</span>
        </span>
        <p class="radio-desc">弹出关闭选项对话框，自由选择是否同时停止本地服务。</p>
      </label>
      <label class="radio-card" :class="{ active: localCloseBehavior === 'minimize' }">
        <input type="radio" v-model="localCloseBehavior" value="minimize" />
        <span class="radio-label">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 10h6"/></svg>
          <span>最小化到系统托盘</span>
        </span>
        <p class="radio-desc">不退出后台常驻进程，持续监控本地环境运行与实时日志输出。</p>
      </label>
      <div class="radio-card" :class="{ active: localCloseBehavior === 'close' }" @click="localCloseBehavior = 'close'">
        <input type="radio" v-model="localCloseBehavior" value="close" />
        <span class="radio-label">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="var(--color-danger, #ef4444)" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>
          <span>直接彻底关闭并终止服务</span>
        </span>
        <p class="radio-desc">直接退出应用并销毁窗口，释放系统资源与本地端口占用。</p>
        <div 
          class="sub-option-row" 
          style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0, 0, 0, 0.06); display: flex; flex-direction: column; gap: 8px;" 
          @click.stop
        >
          <label class="checkbox-label" style="font-size: 12px; color: var(--text-muted); cursor: pointer;">
            <input type="checkbox" v-model="localKillEnvs" />
            <span>同时强杀所有本地开发环境子进程</span>
          </label>
          <label class="checkbox-label" style="font-size: 12px; color: var(--text-muted); cursor: pointer;">
            <input type="checkbox" v-model="localKillServer" />
            <span>同时释放控制台自身服务端口 (3300端口)</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "./SettingsModal.css";
</style>
