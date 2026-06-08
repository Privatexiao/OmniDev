import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

function loadPortConfig() {
  const fallback = { frontendPort: 3000, serverPort: 3300 }
  const appConfigPath = path.resolve(process.cwd(), 'config/app.json')
  const exampleConfigPath = path.resolve(process.cwd(), 'config.example/app.json')
  const configPath = fs.existsSync(appConfigPath) ? appConfigPath : exampleConfigPath
  if (!fs.existsSync(configPath)) return fallback

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return { ...fallback, ...config }
  } catch (err) {
    console.warn(`[DevAssistant] 读取端口配置失败，使用默认端口: ${err.message}`)
    return fallback
  }
}

const portConfig = loadPortConfig()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: portConfig.frontendPort,
    proxy: {
      '/api': {
        target: `http://localhost:${portConfig.serverPort}`,
        changeOrigin: true
      }
    }
  }
})
