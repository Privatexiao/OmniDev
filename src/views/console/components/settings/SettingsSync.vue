<script setup>
/**
 * @file SettingsSync.vue
 * @description 系统设置“同步与备份”子面板，提供加密导出本地配置、触发导入本地 JSON 配置文件以及启动导入预览和树形合并功能
 */
import { ref, nextTick, onMounted } from 'vue'
import Modal from '../../../../components/Modal.vue'
import ImportPreviewModal from './ImportPreviewModal.vue'

const props = defineProps({
  closeOnOverlayClick: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['success', 'close', 'message'])

const EXPORT_DIR_KEY = 'omnidev_export_dir'
const exportDir = ref(localStorage.getItem(EXPORT_DIR_KEY) || '')
const exporting = ref(false)
const pickingDir = ref(false)
const exportWithPrivacy = ref(false)
const lastExportPath = ref('')
const fileInput = ref(null)

// 导入相关状态
const importModalRef = ref(null)
const importPreviewModalRef = ref(null)
const importResult = ref(null)

const loadExportDir = async () => {
  if (exportDir.value) return
  try {
    const res = await fetch('/api/config/default-export-dir')
    const data = await res.json()
    if (data.dir) {
      exportDir.value = data.dir
      saveExportDir()
    }
  } catch (e) { /* ignore */ }
}

const saveExportDir = () => {
  const val = exportDir.value.trim()
  localStorage.setItem(EXPORT_DIR_KEY, val)
}

const exportConfig = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const dir = exportDir.value.trim()
    const params = new URLSearchParams()
    if (dir) params.append('dir', dir)
    if (exportWithPrivacy.value) params.append('includePrivacy', 'true')
    const url = `/api/config/export?${params.toString()}`
    const res = await fetch(url)
    const data = await res.json()
    if (res.ok && data.path) {
      lastExportPath.value = data.path
      emit('message', { text: `配置已导出到: ${data.path}`, type: 'success' })
    } else {
      emit('message', { text: data.error || '导出失败', type: 'danger' })
    }
  } catch (err) {
    emit('message', { text: '导出失败: ' + err.message, type: 'danger' })
  } finally {
    exporting.value = false
  }
}

const pickExportFolder = async () => {
  pickingDir.value = true
  try {
    const res = await fetch('/api/config/pick-folder', { method: 'POST' })
    const data = await res.json()
    if (!data.cancelled && data.dir) {
      exportDir.value = data.dir
      saveExportDir()
    }
  } catch (err) {
    emit('message', { text: `选择文件夹失败: ${err.message}`, type: 'danger' })
  } finally {
    pickingDir.value = false
  }
}

const openExportFolder = async () => {
  const target = lastExportPath.value || exportDir.value.trim()
  if (!target) return
  try {
    await fetch('/api/config/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target })
    })
  } catch (e) { /* ignore */ }
}

const triggerImportFile = () => {
  if (fileInput.value) fileInput.value.click()
}

const handleImportFile = async (e) => {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const text = await file.text()
    const configData = JSON.parse(text)
    if (!configData.envs && !configData.projectsData) {
      emit('message', { text: '无效的导入文件：缺少配置数据', type: 'danger' })
      return
    }
    importPreviewModalRef.value?.show(configData)
  } catch (err) {
    emit('message', { text: '解析导入文件失败: ' + err.message, type: 'danger' })
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

const handleImportSuccess = (data) => {
  if (data && data.isFullBackup) {
    emit('message', { text: data.message || '全量配置导入成功！', type: 'success' })
    emit('success')
  } else {
    importResult.value = data
    nextTick(() => {
      importModalRef.value?.show()
    })
  }
}

const handleImportModalConfirm = () => {
  importModalRef.value?.hide()
  emit('success')
  emit('close')
}

const handleImportModalCancel = () => {
  importModalRef.value?.hide()
  emit('success')
}

onMounted(() => {
  loadExportDir()
})
</script>

<template>
  <div class="animate-fade-in settings-section">
    <div class="settings-header">
      <h4 class="settings-title">🔄 同步与备份</h4>
      <p class="settings-desc">导出当前项目环境及凭证架构为团队配置文件，或从他人处导入配置</p>
    </div>

    <!-- 导出 -->
    <div class="sync-card export-card">
      <h5>📤 导出当前配置</h5>
      <p class="sync-card-desc">将当前项目环境定义及凭证字段架构打包导出（所有敏感值默认已脱敏）</p>
      <div class="export-dir-row" style="display: flex; gap: 6px; margin-bottom: 12px;">
        <input
          v-model="exportDir"
          type="text"
          class="form-control export-dir-input"
          placeholder="导出目录路径..."
          style="flex: 1;"
          @blur="saveExportDir"
          @keyup.enter="saveExportDir"
        />
        <button class="btn-mini btn-mini-cancel" style="margin: 0; padding: 0 12px;" :disabled="pickingDir" @click="pickExportFolder">
          📂
        </button>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="checkbox-label" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" v-model="exportWithPrivacy" />
          <span>是否连同隐私数据（密码和凭证内容）一起导出</span>
        </label>
      </div>
      <p v-if="lastExportPath" class="export-result" style="font-size: 11.5px; margin: 0 0 12px 0;">
        ✅ 已导出：<span class="export-path" style="word-break: break-all; font-family: monospace;">{{ lastExportPath }}</span>
        <a href="#" class="open-folder-link" style="margin-left: 8px; color: var(--primary);" @click.prevent="openExportFolder">打开文件夹 ↗</a>
      </p>
      <button class="btn-mini btn-mini-primary sync-btn" :disabled="exporting" @click="exportConfig">
        {{ exporting ? '导出中...' : '导出' }}
      </button>
    </div>

    <!-- 导入 -->
    <div class="sync-card" style="margin-top: 16px;">
      <h5>📥 导入团队配置</h5>
      <p class="sync-card-desc">从团队配置包中安全导入或一键选择合并项目环境配置</p>
      <button class="btn-mini btn-mini-primary sync-btn import-btn" @click="triggerImportFile">导入</button>
      <input type="file" ref="fileInput" class="hidden-file-input" style="display: none;" accept=".json" @change="handleImportFile" />
    </div>

    <!-- 导入成功弹窗 -->
    <Modal ref="importModalRef" title="✅ 导入成功" :showFooter="true" @confirm="handleImportModalConfirm" @cancel="handleImportModalCancel">
      <div class="import-success-body" style="font-size: 12.5px; line-height: 1.6; display: flex; flex-direction: column; gap: 10px;">
        <p class="import-success-intro">
          新项目 <b>「{{ importResult?.project?.name }}」</b> 已成功注册，包含
          <b>{{ importResult?.envCount || 0 }}</b> 个环境定义。
          <br />请按以下步骤完成配置：
        </p>
        <ol class="import-steps-list" style="padding-left: 16px; margin: 0; display: flex; flex-direction: column; gap: 8px;">
          <li>
            <strong>切换到新项目</strong>
            <p style="margin: 2px 0 0 0; color: var(--text-muted); font-size: 11.5px;">
              关闭设置后在顶部导航栏切换至「{{ importResult?.project?.name }}」，后续所有操作将作用于该新项目。
            </p>
          </li>
          <li>
            <strong>填写在线环境账号密码</strong>
            <p style="margin: 2px 0 0 0; color: var(--text-muted); font-size: 11.5px;">
              进入 <em>环境配置</em> 页面，为以下环境逐个填写 <b>线上账号</b> 与 <b>线上密码</b>：
              <span class="import-env-tags" style="display: inline-flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
                <code v-for="env in (importResult?.envNames || [])" :key="env" style="background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 4px; font-size: 11px;">{{ env }}</code>
              </span>
            </p>
          </li>
          <li>
            <strong>补填凭证字段</strong>
            <p style="margin: 2px 0 0 0; color: var(--text-muted); font-size: 11.5px;">
              在 <em>环境配置 → 登录凭证</em> 中为每个环境补填真实登录凭据值（导入已自动创建了字段结构）。
            </p>
          </li>
        </ol>
      </div>
      <template #footer>
        <button class="btn-mini btn-mini-primary" @click="handleImportModalConfirm">知道了</button>
      </template>
    </Modal>

    <ImportPreviewModal
      ref="importPreviewModalRef"
      :closeOnOverlayClick="closeOnOverlayClick"
      @success="handleImportSuccess"
      @message="({ text, type }) => emit('message', { text, type })"
    />
  </div>
</template>

<style scoped>
@import "./SettingsModal.css";
</style>
