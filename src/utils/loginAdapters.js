const utils = {
  writeCookie(key, value, maxAge = 604800) {
    if (!key) return
    document.cookie = `${key}=${encodeURIComponent(value || '')}; path=/; max-age=${maxAge}`
  },

  writeLocalStorage(key, value) {
    try {
      if (key) localStorage.setItem(key, value || '')
    } catch (e) {
      console.warn('[LoginAdapter] 写入 localStorage 失败:', e.message)
    }
  },

  writeSessionStorage(key, value) {
    try {
      if (key) sessionStorage.setItem(key, value || '')
    } catch (e) {
      console.warn('[LoginAdapter] 写入 sessionStorage 失败:', e.message)
    }
  },

  normalizeCredentialFields(raw) {
    if (Array.isArray(raw)) {
      return raw
        .filter(item => item && item.key)
        .map(item => ({
          key: String(item.key || '').trim(),
          value: item.value || '',
          inject_type: item.inject_type || 'cookie'
        }))
    }
    return Object.entries(raw || {}).map(([key, value]) => ({
      key,
      value,
      inject_type: 'cookie'
    }))
  },

  writeCredentialField(field) {
    if (!field || !field.key) return
    if (field.inject_type === 'localStorage') {
      this.writeLocalStorage(field.key, field.value)
      return
    }
    if (field.inject_type === 'sessionStorage') {
      this.writeSessionStorage(field.key, field.value)
      return
    }
    this.writeCookie(field.key, field.value)
  }
}

export const loginAdapters = {
  dynamic: {
    name: '动态凭证注入',
    desc: '按字段配置把登录凭证注入 Cookie、localStorage 或 sessionStorage',
    execute(config) {
      const credentialFields = utils.normalizeCredentialFields(config.credentials)
      utils.writeCookie('VUE_DEV_HOST', config.VUE_DEV_HOST)
      credentialFields.forEach(field => utils.writeCredentialField(field))

      let link = config.custom_link || '{{VUE_DEV_HOST}}'
      const cleanDevHost = (config.VUE_DEV_HOST || '').replace(/\/$/, '')
      link = link.replace('{{VUE_DEV_HOST}}', cleanDevHost)

      if (link && !link.startsWith('http') && !link.startsWith('//')) {
        const subPathClean = link.startsWith('/') ? link : '/' + link
        link = `${cleanDevHost}${subPathClean}`
      }

      return link
    }
  }
}
