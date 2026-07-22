/**
 * @file useAppUpdate.js
 * @description 应用更新检查、策略分流及 Tauri 签名更新进度的共享状态管理
 */
import { ref, shallowRef, onUnmounted } from 'vue'

export function useAppUpdate(appConfig, showMessage) {
  const showUpdateBanner = ref(false)
  const latestUpdateInfo = ref(null)

  const downloadingUpdate = shallowRef(false)
  const downloadPercent = shallowRef(0)
  const downloadStatus = shallowRef('idle')
  const downloadError = shallowRef(null)
  const showInstallConfirm = shallowRef(false)
  const installingAndExiting = shallowRef(false)

  let unlistenUpdateProgress = null

  const autoCheckAppUpdate = async () => {
    try {
      if (appConfig.value?.autoCheckUpdate === false) return

      const res = await fetch('/api/system/check-update')
      if (!res.ok) return
      const data = await res.json()
      if (data.success && data.hasUpdate) {
        const ignoredVersion = localStorage.getItem('omnidev_ignored_version')
        if (ignoredVersion !== data.latestVersion) {
          latestUpdateInfo.value = data
          showUpdateBanner.value = true
        }
      }
    } catch (e) {
      console.warn('[AutoUpdate] 自动检查更新失败:', e.message)
    }
  }

  const stopDownloadPolling = () => {
    if (unlistenUpdateProgress) {
      unlistenUpdateProgress()
      unlistenUpdateProgress = null
    }
  }

  const ensureProgressListener = async () => {
    if (unlistenUpdateProgress || !window.__TAURI__?.event?.listen) return
    unlistenUpdateProgress = await window.__TAURI__.event.listen('app-update-progress', ({ payload }) => {
      if (payload?.event === 'progress') {
        const total = Number(payload.contentLength) || 0
        const downloaded = Number(payload.downloaded) || 0
        downloadStatus.value = 'downloading'
        downloadPercent.value = total > 0 ? Math.min(99, Math.round(downloaded / total * 100)) : 0
      } else if (payload?.event === 'finished') {
        downloadStatus.value = 'installing'
        downloadPercent.value = 100
      } else if (payload?.event === 'installed') {
        downloadStatus.value = 'completed'
        downloadPercent.value = 100
      }
    })
  }

  const installOfficialUpdate = async () => {
    if (installingAndExiting.value || downloadingUpdate.value) return
    const updateInfo = latestUpdateInfo.value
    if (!window.__TAURI__?.core?.invoke) {
      showMessage('应用内更新仅在 Tauri 桌面版中可用', 'warning')
      return
    }
    if (!updateInfo?.signatureAvailable) {
      showMessage('更新源缺少签名，已拒绝执行更新', 'error')
      return
    }

    downloadingUpdate.value = true
    installingAndExiting.value = true
    downloadPercent.value = 0
    downloadStatus.value = 'downloading'
    downloadError.value = null
    try {
      await ensureProgressListener()
      const endpoint = updateInfo.updateUrl || appConfig.value?.updateUrl || ''
      const separator = endpoint.includes('?') ? '&' : '?'
      const updateUrl = endpoint ? `${endpoint}${separator}_t=${Date.now()}` : null
      showMessage('正在下载并校验签名更新，完成后将自动重启...', 'info')
      await window.__TAURI__.core.invoke('install_app_update', { updateUrl })
    } catch (err) {
      downloadStatus.value = 'error'
      downloadError.value = String(err?.message || err || '未知错误')
      downloadingUpdate.value = false
      installingAndExiting.value = false
      showMessage(`应用内更新失败: ${downloadError.value}`, 'error')
    }
  }

  const downloadNewVersion = async (updateInfo) => {
    if (!updateInfo?.hasUpdate) return
    latestUpdateInfo.value = updateInfo
    if (updateInfo.updateMode === 'manual') {
      showInstallConfirm.value = true
      return
    }
    await installOfficialUpdate()
  }

  const confirmInstallAndExit = async () => {
    showInstallConfirm.value = false
    await installOfficialUpdate()
  }

  onUnmounted(() => {
    stopDownloadPolling()
  })

  return {
    showUpdateBanner,
    latestUpdateInfo,
    downloadingUpdate,
    downloadPercent,
    downloadStatus,
    downloadError,
    showInstallConfirm,
    installingAndExiting,
    autoCheckAppUpdate,
    downloadNewVersion,
    confirmInstallAndExit,
    stopDownloadPolling
  }
}
