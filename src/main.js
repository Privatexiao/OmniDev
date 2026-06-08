import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

async function bootstrap() {
  if (window.__TAURI__) {
    try {
      const port = await window.__TAURI__.core.invoke('get_backend_port');
      const originalFetch = window.fetch;
      window.fetch = function (input, init) {
        if (typeof input === 'string' && input.startsWith('/api/')) {
          input = `http://localhost:${port}${input}`;
        }
        return originalFetch(input, init);
      };
      console.log(`[DevAssistant] 全局 API 代理成功重定向到 Node 本地端口: ${port}`);
    } catch (e) {
      console.error('[DevAssistant] 获取后端端口失败，API 代理降级:', e);
    }
  }

  createApp(App).mount('#app')
}

bootstrap()
