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
      <h4 class="settings-title">💻 端口与运行配置</h4>
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
    <p class="form-help" style="margin-top: 12px;">
      ⚠️ 提示：端口修改将在下一次控制台彻底重启服务后生效。
    </p>
  </div>
</template>

<style scoped>
@import "./SettingsModal.css";
</style>
