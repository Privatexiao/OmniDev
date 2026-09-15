<script setup>
/**
 * @file SettingsBasic.vue
 * @description 系统设置基础配置面板，用于修改主控后端服务端口、本地前端代理端口以及动态分配端口范围
 */
const props = defineProps({
  appConfigForm: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:appConfigForm'])

const updateNumberField = (field, event) => {
  const rawValue = event.target.value
  emit('update:appConfigForm', {
    ...props.appConfigForm,
    [field]: rawValue === '' ? '' : Number(rawValue)
  })
}
</script>

<template>
  <div class="animate-fade-in settings-section">
    <div class="settings-header">
      <h4 class="settings-title">端口与运行配置</h4>
      <p class="settings-desc">配置 OmniDev 控制台的基础服务运行及动态代理端口参数</p>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>控制台服务端口 (Express)</label>
        <input :value="appConfigForm.serverPort" type="number" class="form-control" placeholder="例如: 3300" @input="updateNumberField('serverPort', $event)" />
      </div>
      <div class="form-group">
        <label>前端本地代理端口 (Vite)</label>
        <input :value="appConfigForm.frontendPort" type="number" class="form-control" placeholder="例如: 3000" @input="updateNumberField('frontendPort', $event)" />
      </div>
      <div class="form-group">
        <label>起始分配端口</label>
        <input :value="appConfigForm.defaultPort" type="number" class="form-control" placeholder="默认: 8080" @input="updateNumberField('defaultPort', $event)" />
      </div>
      <div class="form-group">
        <label>最大分配端口</label>
        <input :value="appConfigForm.maxPort" type="number" class="form-control" placeholder="默认: 8150" @input="updateNumberField('maxPort', $event)" />
      </div>
    </div>
    <div class="callout-tip" style="margin-top: 14px; display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--text-muted); background: rgba(0, 0, 0, 0.025); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.05);">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 4.5h.01"/></svg>
      <span>提示：端口参数修改将在下一次控制台彻底重启服务后正式生效。</span>
    </div>
  </div>
</template>

<style scoped>
@import "./SettingsModal.css";
</style>
