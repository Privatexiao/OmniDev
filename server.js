/**
 * @file server.js
 * @description OmniDev 后端服务入口文件。负责基础 Express 框架初始化、新版模块化路由挂载、静态资源分发及进程异常退出安全回收。
 */
// ⚠️ 必须放在所有其它 import 之前：将 Windows 控制台代码页切到 UTF-8(65001)，
// 否则后续模块在导入期（如 pathConfig 的冷启动迁移日志）输出的中文会被 GBK 控制台打成乱码。
import './server/bootstrapEncoding.js';

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 导入路径初始化配置 (冷启动自愈物理隔离迁移)
import { APP_CONFIG_PATH } from './server/config/pathConfig.js';

// 导入路由模块
import projectRoutes from './server/routes/projectRoutes.js';
import envRoutes from './server/routes/envRoutes.js';
import startRoutes from './server/routes/startRoutes.js';
import sshRoutes from './server/routes/sshRoutes.js';
import terminalRoutes from './server/routes/terminalRoutes.js';
import configRoutes from './server/routes/configRoutes.js';

// 导入服务以支持系统退出时的回收操作
import { disconnectSSH } from './server/services/sshService.js';
import { killActiveProcess, loadState } from './server/services/processService.js';
import { cleanOldLogs } from './server/services/logService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 🚀 从全局 app.json 中动态读取后端服务运行端口，降级兜底为 3300，彻底避免抢占前端 3000 端口！
let PORT = 3300;
try {
  if (fs.existsSync(APP_CONFIG_PATH)) {
    const appCfg = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
    if (appCfg && appCfg.serverPort) {
      PORT = parseInt(appCfg.serverPort, 10) || 3300;
    }
  }
} catch (e) {
  console.error('[DevAssistant] 读取 app.json 后端端口失败，降级使用 3300:', e.message);
}
PORT = process.env.PORT || PORT;

// 1. 全局中间件配置
app.use(cors());
app.use(express.json());

// 🚀 全局 HTTP 请求日志中间件，过滤高频轮询以保持控制台清爽，同时在交互时提供即时的活动日志更新
app.use((req, res, next) => {
  // 过滤高频且无实质变化的轮询请求，避免日志刷屏
  if (req.path === '/api/logs' || req.path === '/api/envs') {
    return next();
  }
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${time}] 🚀 ${req.method} ${req.originalUrl}`);
  next();
});

// 🚀 自适应初始化冷启动加载：从当前项目的 state.json 状态文件中反序列化活跃端口映射
loadState();

// 2. 注册模块化路由
app.use(projectRoutes);
app.use(envRoutes);
app.use(startRoutes);
app.use(sshRoutes);
app.use(terminalRoutes);
app.use(configRoutes);

// 3. 静态资源托管 (分发大盘前端静态界面)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // 单页应用 SPA 路由兜底
  app.get('*splat', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('OmniDev Backend is running. Frontend "dist" folder not found, please build frontend project.');
  });
}

// 4. 监听端口并成功冷启动
const server = app.listen(PORT, '127.0.0.1', () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  console.log(`========================================`);
  console.log(`[Ready]   OmniDev Engine v1.0 Active!`);
  console.log(`[Server]  Local Control: http://localhost:${PORT}`);
  console.log(`[Sandbox] Physical Sandbox Security Enabled.`);
  console.log(`[Time]    ${timeStr}`);
  console.log(`========================================`);
  
  // 🚀 后端控制端冷启动监听成功后，立即全局清理一次超过 3 天的历史日志文件，释放磁盘空间
  try {
    cleanOldLogs();
  } catch (e) { /* ignore */ }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n================================================================`);
    console.error(`⚠️  [Error] 端口 ${PORT} 已被占用，服务启动失败！`);
    if (process.platform === 'win32') {
      console.error(`👉  [Fix 1] 您可以在 PowerShell 中运行以下命令强行释放该端口：`);
      console.error(`            Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
    } else {
      console.error(`👉  [Fix 1] 您可以在终端中运行以下命令强行释放该端口：`);
      console.error(`            kill -9 $(lsof -t -i:${PORT})`);
    }
    console.error(`👉  [Fix 2] 释放端口后，您可以使用以下命令启动/重启 3300 后端控制端服务：`);
    console.error(`            node server.js`);
    console.error(`================================================================\n`);
  } else {
    console.error(`[Error] 服务启动遭遇异常错误:`, err.message);
  }
  process.exit(1);
});

// 🚀 自毁接口：由前端在彻底关闭应用时调用，释放控制台自身服务端口并可选终结本地项目开发环境
let pendingKillEnvs = false;  // 记录前端最近一次请求的 killEnvs 意图，防止信号处理器竞态覆盖

app.post('/api/system/shutdown', (req, res) => {
  const { killEnvs } = req.body || {};
  pendingKillEnvs = !!killEnvs;
  res.json({ success: true, message: '后端服务正在优雅退出...' });
  setTimeout(() => {
    handleGracefulExit(pendingKillEnvs);
  }, 500);
});

// 5. 🔔 进程级别退出信号捕获与安全回收
const handleGracefulExit = (killEnvs = false) => {
  // 优先使用前端明确设置的 killEnvs 值（通过 pendingKillEnvs），
  // 由于直接 SIGINT/SIGTERM 时 Node 会传入信号字符串（如 'SIGINT'），此处必须严格过滤非布尔值参数
  const explicitKill = killEnvs === true;
  const shouldKill = pendingKillEnvs || explicitKill;
  console.log(`\n[System] ♻️ 收到进程退出信号，正在安全回收资源...`);
  try {
    if (shouldKill) {
      console.log('[System] 🚀 正在全局跨项目强杀并回收全部开启的本地项目环境进程...');
      killActiveProcess();
      console.log('[System] ✔️ 所有项目本地开发沙箱环境已安全终结！');
    } else {
      console.log('[System] 💡 保持本地项目环境后台独立运行，仅安全释放控制台主服务进程。');
    }
    disconnectSSH();
    console.log('[System] ✔️ 远程连接已安全释放！退出完毕。');
  } catch (e) {
    console.error('[System] ❌ 退出回收过程中发生异常:', e.message);
  }
  process.exit(0);
};

process.on('SIGINT', handleGracefulExit);
process.on('SIGTERM', handleGracefulExit);
process.on('uncaughtException', (err) => {
  console.error('[Fatal Error] 未捕获的运行时异常:', err);
});
