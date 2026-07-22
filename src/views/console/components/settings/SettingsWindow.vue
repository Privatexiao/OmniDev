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
      <h4 class="settings-title">🔔 窗口关闭行为偏好</h4>
      <p class="settings-desc">设定点击控制台客户端右上角关闭按钮时的默认系统行为</p>
    </div>
    <div class="radio-group">
      <label class="radio-card" :class="{ active: localCloseBehavior === 'ask' }">
        <input type="radio" v-model="localCloseBehavior" value="ask" />
        <span class="radio-label">❓ 每次询问</span>
        <p class="radio-desc">弹出关闭选项对话框，自由选择是否同时停止本地服务。</p>
      </label>
      <label class="radio-card" :class="{ active: localCloseBehavior === 'minimize' }">
        <input type="radio" v-model="localCloseBehavior" value="minimize" />
        <span class="radio-label">📌 最小化到系统托盘</span>
        <p class="radio-desc">不退出进程，后台持续监控本地服务与日志状态。</p>
      </label>
      <div class="radio-card" :class="{ active: localCloseBehavior === 'close' }" @click="localCloseBehavior = 'close'">
        <input type="radio" v-model="localCloseBehavior" value="close" />
        <span class="radio-label">⛔ 直接彻底关闭并终止服务</span>
        <p class="radio-desc">退出应用，释放系统资源与端口占用。</p>
        <div 
          class="sub-option-row" 
          style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(120, 120, 120, 0.2); display: flex; flex-direction: column; gap: 6px;" 
          @click.stop
        >
          <label class="checkbox-label" style="font-size: 11.5px; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <input type="checkbox" v-model="localKillEnvs" />
            <span>同时强杀所有本地开发环境子进程</span>
          </label>
          <label class="checkbox-label" style="font-size: 11.5px; color: var(--text-muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
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
