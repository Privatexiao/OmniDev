<script setup>
/**
 * @file SettingsBasic.vue
 * @description 系统设置基础配置面板，用于修改主控后端服务端口、本地前端代理端口以及动态分配端口范围
 */
import { ref, watch } from 'vue'

const props = defineProps({
  appConfigForm: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:appConfigForm'])

const localForm = ref({ ...props.appConfigForm })

watch(() => props.appConfigForm, (newVal) => {
  localForm.value = { ...newVal }
}, { deep: true })

watch(localForm, (newVal) => {
  emit('update:appConfigForm', newVal)
}, { deep: true })
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
        <input v-model.number="localForm.serverPort" type="number" class="form-control" placeholder="例如: 3300" />
      </div>
      <div class="form-group">
        <label>前端本地代理端口 (Vite)</label>
        <input v-model.number="localForm.frontendPort" type="number" class="form-control" placeholder="例如: 3000" />
      </div>
      <div class="form-group">
        <label>起始分配端口</label>
        <input v-model.number="localForm.defaultPort" type="number" class="form-control" placeholder="默认: 8080" />
      </div>
      <div class="form-group">
        <label>最大分配端口</label>
        <input v-model.number="localForm.maxPort" type="number" class="form-control" placeholder="默认: 8150" />
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
