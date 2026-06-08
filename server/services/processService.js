/**
 * @file server/services/processService.js
 * @description 本地进程与端口管理服务。提供端口占用检测、可用端口分配、进程强杀以及服务运行状态查询等功能。
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { appConfig } from './projectService.js';
import { getCommonEnvs } from './envService.js';
import { state, loadState as loadStateService, saveState as saveStateService } from './stateService.js';
import { CONFIG_DIR, PROJECTS_FILE_PATH } from '../config/pathConfig.js';

// 运行态全局变量托管
export let currentEnv = '';
export let envPorts = {};         // 记录各个环境被分配的本地端口映射，如 { work3: 8080 }
export let activeProcesses = {};  // 记录各个环境当前运行的 Node 进程句柄，如 { work3: ChildProcess }

/**
 * 设置当前环境
 * @param {string} env 
 */
export function setCurrentEnv(env) {
  currentEnv = env;
}

/**
 * 从本地持久化状态文件中加载上次运行的环境及端口分配状态
 */
export function loadState() {
  loadStateService();
  currentEnv = state.currentEnv || '';
  envPorts = state.envPorts || {};
}

/**
 * 保存当前激活状态与端口映射到本地文件
 */
export function saveState() {
  state.currentEnv = currentEnv;
  state.envPorts = envPorts;
  saveStateService();
}

/**
 * 动态检测本地指定端口是否被占用，并获取其 PID
 * @param {number} port 
 * @returns {number|null}
 */
export function getPortPid(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync('chcp 65001 > nul && netstat -ano', { encoding: 'utf8' });
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            return parseInt(pid, 10);
          }
        }
      }
    } else {
      // macOS 与 Linux 系统，使用 lsof 获取监听端口 PID
      const output = execSync(`lsof -t -i :${port}`, { encoding: 'utf8' });
      const pidStr = output.trim().split('\n')[0];
      if (pidStr && !isNaN(pidStr)) {
        return parseInt(pidStr, 10);
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return null;
}

// 高频检测极速内存缓存字典：记录端口是否被占用，以及上一次探测的时间戳
const portStatusCache = {};

/**
 * 异步利用原生网络套接字，以毫秒级速度和 0% CPU 占用率静默探测本地端口是否开启
 * @param {number} port 
 * @returns {Promise<boolean>}
 */
export function probePortOccupiedAsync(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250); // 250ms 超时，确保高并发时绝不悬挂阻塞
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true); // 成功连上，说明端口绝对被占用了
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false); // 拒绝连接，说明端口绝对空闲
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * 高性能异步占位查询：高频刷新时 0ms 瞬间返回内存缓存，否则异步发起套接字微探测更新缓存，CPU 占用直接降至 0%
 * @param {number} port 
 * @returns {Promise<boolean>}
 */
export async function isPortOccupied(port) {
  const now = Date.now();
  const cached = portStatusCache[port];

  // 1. 若有缓存，且距离上一次真实检测不足 1800ms，直接瞬间返回，0ms 开销！
  if (cached && (now - cached.lastChecked < 1800)) {
    return cached.isOccupied;
  }

  // 2. 无有效缓存：立刻执行异步套接字微探测，确保状态真实灵敏，并在完成后更新缓存返回最新状态
  const isOccupied = await probePortOccupiedAsync(port);
  portStatusCache[port] = {
    isOccupied,
    lastChecked: Date.now()
  };

  return isOccupied;
}

/**
 * 实时精准测试某个端口是否可用 (通过尝试创建临时 TCP 服务端监听)
 * @param {number} port 
 * @returns {Promise<boolean>} 若空闲可用返回 true，若已被占用返回 false
 */
export function isPortAvailableAsync(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(false); // 报错说明端口被占用了
    });
    
    server.once('listening', () => {
      server.close(() => {
        resolve(true); // 成功监听到说明端口绝对可用
      });
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * 异步寻找第一个闲置可用的本地 TCP 端口 (纯系统套接字尝试，0ms 阻塞与 0% CPU 损耗)
 * @param {number} startPort 
 * @returns {Promise<number>}
 */
export async function getFirstFreePort(startPort = 8080) {
  let port = startPort;
  const maxPort = appConfig.maxPort || 8150;
  while (port < maxPort) {
    const isAvailable = await isPortAvailableAsync(port);
    if (isAvailable) {
      return port;
    }
    port++;
  }
  return startPort;
}

/**
 * 强行精准关闭特定环境的本地服务
 * @param {string} env 环境标识
 */
export function killEnvProcess(env) {
  if (!env) return;
  const envName = env.includes('@') ? env.split('@')[0] : env;

  // 1. 关闭该环境对应的子进程句柄
  const procKey = activeProcesses[envName] ? envName : env;
  if (activeProcesses[procKey]) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${activeProcesses[procKey].pid}`, { stdio: 'ignore' });
      } else {
        // macOS/Linux: 尝试优雅关闭后强杀
        process.kill(activeProcesses[procKey].pid, 'SIGTERM');
        setTimeout(() => {
          try {
            process.kill(activeProcesses[procKey].pid, 'SIGKILL');
          } catch (e) {}
        }, 100);
      }
    } catch (e) {
      // 忽略
    }
    delete activeProcesses[procKey];
  }

  // 2. 强杀该环境所关联端口上的 PID
  const port = envPorts[envName] || envPorts[env];
  if (port) {
    const portPid = getPortPid(port);
    if (portPid) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /F /PID ${portPid}`, { stdio: 'ignore' });
        } else {
          execSync(`kill -9 ${portPid}`, { stdio: 'ignore' });
        }
        console.log(`[DevAssistant] 强杀环境 [${envName}] 残留端口 [${port}] 进程 (PID: ${portPid}) 成功`);
      } catch (e) {
        // 忽略
      }
    }
  }

  // 3. 清理已关闭环境的端口映射记录并保存状态
  delete envPorts[envName];
  delete envPorts[env];
  saveState();
}

/**
 * 🚀 全局跨项目强行关闭本地所有正在运行的服务
 * 扫描所有已注册项目的 state.json，精准强杀每个项目下当前占用端口的进程，
 * 与前端"运行中的本地项目"面板的全局扫描逻辑完全一致，确保不遗漏、不误杀。
 */
export function killActiveProcess() {
  const killedPids = new Set();

  // 1. 优先强杀当前内存中已托管的活跃子进程句柄，这是最快最准确的通道
  for (const env of Object.keys(activeProcesses)) {
    killEnvProcess(env);
  }

  // 2. 全局交叉扫描所有已注册项目的 state.json，逐一强杀占用端口的残留进程
  try {
    if (fs.existsSync(PROJECTS_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
      const projectsList = data.projects || [];

      for (const proj of projectsList) {
        if (!proj.id) continue;
        const projectStatePath = path.join(CONFIG_DIR, 'projects', proj.id, 'state.json');
        if (!fs.existsSync(projectStatePath)) continue;

        try {
          const stateData = JSON.parse(fs.readFileSync(projectStatePath, 'utf-8'));
          const portsDict = stateData.envPorts || {};

          for (const [envKey, port] of Object.entries(portsDict)) {
            if (!port) continue;
            const portPid = getPortPid(port);
            if (!portPid || killedPids.has(portPid)) continue;

            try {
              if (process.platform === 'win32') {
                execSync(`taskkill /F /T /PID ${portPid}`, { stdio: 'ignore' });
              } else {
                execSync(`kill -9 ${portPid}`, { stdio: 'ignore' });
              }
              killedPids.add(portPid);
              console.log(`[DevAssistant] 全局扫描强杀项目 [${proj.name}] 环境 [${envKey}] 端口 [${port}] 进程 (PID: ${portPid}) 成功`);
            } catch (e) {
              // 进程可能已经自行退出，忽略
            }
          }

          // 清理该项目 state.json 中的端口映射
          if (Object.keys(portsDict).length > 0) {
            fs.writeFileSync(projectStatePath, JSON.stringify({
              currentEnv: stateData.currentEnv || '',
              envPorts: {}
            }, null, 2), 'utf-8');
          }
        } catch (e) {
          console.error(`[DevAssistant] 全局扫描强杀项目 [${proj.name}] 失败:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error('[DevAssistant] 全局项目扫描强杀失败:', err.message);
  }

  // 3. 兜底：清理当前内存中的端口映射残余
  for (const env of Object.keys(envPorts)) {
    delete envPorts[env];
  }
  saveState();
}

/**
 * 兼容性的运行状态查询函数，支持精准某个环境或全局检索是否处于运行中
 * @param {string} [env] 
 * @returns {Promise<boolean>}
 */
export async function isServiceRunning(env) {
  if (env) {
    const envName = env.includes('@') ? env.split('@')[0] : env;
    const port = envPorts[envName] || envPorts[env];
    return port ? await isPortOccupied(port) : false;
  }
  const results = await Promise.all(Object.values(envPorts).map(port => isPortOccupied(port)));
  return results.some(r => r);
}

// 自动执行一次状态加载
loadState();
