/**
 * 跨平台兼容适配层 (platform compatibility layer)
 *
 * 本应用同时运行于两种宿主环境：
 *   1. Tauri 桌面外壳 (Windows / macOS / Linux)：window.__TAURI__ 已注入
 *   2. 普通浏览器 / Webview：可能通过 HTTP + 局域网 IP 访问 (非安全上下文)
 *
 * 不同宿主对 navigator.clipboard、window.matchMedia、window.open 等 API 的支持
 * 存在差异，本模块统一收敛这些差异，保证业务层无需关心当前所处平台。
 */

/** 是否运行于 Tauri 桌面外壳环境 */
export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI__
}

/**
 * 跨平台复制到剪贴板。
 *
 * navigator.clipboard 仅在安全上下文 (HTTPS / localhost) 可用；当通过 HTTP 局域网
 * IP 访问时它为 undefined，直接调用会抛错。此处优先使用现代 API，失败再降级到
 * 传统 document.execCommand('copy') 兜底，确保任意平台都能复制成功。
 *
 * @param {string} text 待复制文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyToClipboard(text) {
  if (text == null || text === '') return false

  // 优先：现代异步剪贴板 API（安全上下文）
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(String(text))
      return true
    } catch (err) {
      console.warn('[platform] navigator.clipboard 写入失败，尝试降级方案:', err?.message)
    }
  }

  // 降级：传统 execCommand 兜底（适配 HTTP / 老旧 Webview）
  return legacyCopy(String(text))
}

/** 传统剪贴板兜底：利用隐藏 textarea + execCommand('copy') */
function legacyCopy(text) {
  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // 移出可视区域，避免页面抖动与聚焦丢失
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (err) {
    console.error('[platform] 传统剪贴板兜底失败:', err?.message)
    return false
  }
}

/**
 * 跨平台打开外部链接。
 *
 * 浏览器下走标准 window.open；若被弹窗拦截器拦截（返回 null）则返回 false，
 * 业务层可据此给出提示。Tauri 默认 Webview 同样支持 window.open 打开系统浏览器。
 *
 * @param {string} url 目标地址
 * @returns {boolean} 是否成功发起打开
 */
export async function openExternal(url) {
  if (!url) return false
  
  // 🚀 优先通过后端 Node.js 宿主进程以 OS 级原生命令拉起默认浏览器，避免 Tauri 桌面壳安全限制和浏览器弹窗拦截
  try {
    const res = await fetch('/api/system/open-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    if (res.ok) {
      return true
    }
  } catch (err) {
    console.warn('[platform] 尝试请求后端 /api/system/open-url 失败，执行传统 window.open 兜底:', err)
  }

  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    return win !== undefined
  } catch (err) {
    console.error('[platform] window.open 打开外部链接失败:', err?.message)
    return false
  }
}

/**
 * 安全读取系统是否偏好暗色主题。
 * 个别嵌入式 Webview 不实现 matchMedia，这里做存在性兜底，默认返回 false(亮色)。
 */
export function prefersDarkScheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/**
 * 监听系统主题变化，返回取消监听的清理函数。
 * 若当前平台不支持 matchMedia，则返回一个无副作用的空清理函数。
 *
 * @param {(matches: boolean) => void} callback 主题变化回调，参数为是否暗色
 * @returns {() => void} 取消监听函数
 */
export function watchColorScheme(callback) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  let mediaQuery
  try {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  } catch {
    return () => {}
  }
  const handler = (e) => callback(e.matches)
  // 兼容旧版 Safari/Webview：addEventListener 不可用时降级到 addListener
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }
  if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handler)
    return () => mediaQuery.removeListener(handler)
  }
  return () => {}
}
