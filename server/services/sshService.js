/**
 * @file server/services/sshService.js
 * @description SSH 连接与凭证管理服务。提供按项目隔离的 SSH 连接池、闲置超时管理、远程命令执行以及凭证读写功能。
 */
import fs from 'fs';
import path from 'path';
import { getSSHFilePath } from '../config/pathConfig.js';
import { appConfig } from './projectService.js';
import { writeLog } from './logService.js';

// 🔌 SSH 缓存连接池与 5 分钟闲置自动超时断开管理
export let cachedSSHConn = null;
export let cachedSSHKey = '';
let sshIdleTimer = null;
let Client = null;

function readJsonFile(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[DevAssistant] 读取 JSON 失败 ${filePath}:`, e.message);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// 获取当前激活项目的 SSH 连接配置（按项目隔离）
export function getGlobalSSHConfig() {
  return readJsonFile(getSSHFilePath(), {});
}

// 保存当前激活项目的 SSH 连接配置
export function saveGlobalSSHConfig(sshConfig) {
  try {
    writeJsonFile(getSSHFilePath(), sshConfig || {});
  } catch (e) {
    console.error('[DevAssistant] 写入 SSH 配置文件失败:', e.message);
  }
}

// 解析远程环境绝对路径
export function getRemoteEnvPath(sshConfig, envConfig) {
  const remoteDir = String(envConfig.remote_dir || '').trim();
  if (!remoteDir) return '';
  if (remoteDir.startsWith('/')) return path.posix.normalize(remoteDir);

  const parentDir = sshConfig.remote_path
    ? path.posix.dirname(sshConfig.remote_path)
    : '/var/www';
  return path.posix.join(parentDir, remoteDir);
}

// 获取项目级 SSH 配置
export function resolveEnvSSHConfig(envConfig) {
  return getGlobalSSHConfig();
}

// 动态载入 SSH 模块
async function getSSHClient() {
  if (Client) return Client;
  try {
    const ssh2Module = await import('ssh2');
    Client = ssh2Module.default.Client;
    return Client;
  } catch (e) {
    throw new Error('缺少 ssh2 依赖，请先在项目目录执行 npm install 后重试：' + e.message);
  }
}

// 重置 5 分钟闲置超时定时器，每次使用连接时均从最新时点重新计时 5 分钟
function resetSSHIdleTimer() {
  if (sshIdleTimer) {
    clearTimeout(sshIdleTimer);
  }
  sshIdleTimer = setTimeout(() => {
    if (cachedSSHConn) {
      console.log('[DevAssistant] SSH 连接闲置超时 (5分钟)，主动释放缓存连接。');
      try {
        cachedSSHConn.end();
      } catch (e) {}
      cachedSSHConn = null;
      cachedSSHKey = '';
    }
  }, 5 * 60 * 1000); // 5分钟
}

// 智能获取并复用已缓存的 SSH 客户端实例，若失效或凭证不同则建立新连接
export function getCachedSSHConnection(sshConfig) {
  return new Promise(async (resolve, reject) => {
    const key = `${sshConfig.host}:${sshConfig.port || 22}:${sshConfig.username}:${sshConfig.password || ''}`;
    
    // 若存在已缓存的长连接且环境/账户配置完全吻合，则直接刷新定时器并复用
    if (cachedSSHConn && cachedSSHKey === key) {
      resetSSHIdleTimer();
      return resolve(cachedSSHConn);
    }
    
    // 否则优雅关闭并销毁之前的失效/异地连接，防止连接泄露
    if (cachedSSHConn) {
      try {
        cachedSSHConn.end();
      } catch (e) {}
      cachedSSHConn = null;
      cachedSSHKey = '';
    }
    
    try {
      const SSHClient = await getSSHClient();
      const conn = new SSHClient();
      let isResolved = false;
      
      conn.on('ready', () => {
        cachedSSHConn = conn;
        cachedSSHKey = key;
        resetSSHIdleTimer();
        isResolved = true;
        resolve(conn);
      }).on('error', (err) => {
        if (cachedSSHConn === conn) {
          cachedSSHConn = null;
          cachedSSHKey = '';
        }
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      }).on('end', () => {
        if (cachedSSHConn === conn) {
          cachedSSHConn = null;
          cachedSSHKey = '';
        }
      }).on('close', () => {
        if (cachedSSHConn === conn) {
          cachedSSHConn = null;
          cachedSSHKey = '';
        }
      }).connect({
        host: sshConfig.host,
        port: sshConfig.port || 22,
        username: sshConfig.username,
        password: sshConfig.password,
        readyTimeout: 15000,
        keepaliveInterval: 10000, // 每 10 秒发送一次 Keepalive 链路心跳，保障连接不被中继断开
        keepaliveCountMax: 3
      });
    } catch (err) {
      reject(err);
    }
  });
}

// 登录远程服务器并执行 Shell 命令 (统一写入 remote 远程日志文件，全量复用长连接池)
export function runRemoteCommand(sshConfig, command, env = '', silent = false) {
  return new Promise(async (resolve, reject) => {
    try {
      const key = `${sshConfig.host}:${sshConfig.port || 22}:${sshConfig.username}:${sshConfig.password || ''}`;
      const isReused = !!(cachedSSHConn && cachedSSHKey === key);
      const conn = await getCachedSSHConnection(sshConfig);
      
      if (!silent) {
        if (!isReused) {
          writeLog(`🔑 [Remote SSH] 成功登录远程服务器 ${sshConfig.host}:${sshConfig.port}\n`, env, 'System', 'remote');
        }
      }
      
      conn.exec(command, (err, stream) => {
        if (err) {
          // 若 exec 指令下发报错，很可能是 TCP 连接已单向死掉，立刻释放并清理缓存以防下次仍复用死链接
          try { conn.end(); } catch (e) {}
          if (cachedSSHConn === conn) {
            cachedSSHConn = null;
            cachedSSHKey = '';
          }
          return reject(err);
        }
        
        let stdout = '';
        let stderr = '';
        
        stream.on('close', (code, signal) => {
          // 再次刷新闲置计时器，确保闲置从命令运行结束起重新计算 5 分钟
          resetSSHIdleTimer();
          resolve({ code, stdout, stderr });
        }).on('data', (data) => {
          const out = data.toString();
          stdout += out;
          if (!silent) {
            let logMsg = `[Remote Server] ${out}`;
            if (out.includes('Already up to date') || out.includes('已经是最新的')) {
              logMsg = `✨ [Remote Server] ${out}`;
            }
            writeLog(logMsg, env, 'System', 'remote');
          }
        }).stderr.on('data', (data) => {
          const errOut = data.toString();
          stderr += errOut;
          if (!silent) {
            writeLog(`[Remote Server Error] ${errOut}`, env, 'System', 'remote');
          }
        });
      });
    } catch (err) {
      // 捕获外部连接层级的抛错，若连接有缓存，主动销毁清理
      if (cachedSSHConn) {
        try { cachedSSHConn.end(); } catch (e) {}
        cachedSSHConn = null;
        cachedSSHKey = '';
      }
      reject(err);
    }
  });
}

// 手动断开活动的 SSH 缓存长连接
export function disconnectSSH() {
  if (cachedSSHConn) {
    try {
      cachedSSHConn.end();
    } catch (e) {}
    cachedSSHConn = null;
    cachedSSHKey = '';
    if (sshIdleTimer) {
      clearTimeout(sshIdleTimer);
      sshIdleTimer = null;
    }
    return true;
  }
  return false;
}
