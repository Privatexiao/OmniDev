/**
 * @file server/routes/envRoutes.js
 * @description 环境管理 API 路由。提供环境列表查询、配置新增/编辑/删除以及自动登录。
 *              一个项目对应一组扁平环境，环境键即 envName，不再区分主/子项目。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { getActiveProject, PROJECTS_FILE_PATH, CONFIG_DIR } from '../config/pathConfig.js';
import { appConfig } from '../services/projectService.js';
import { getGlobalSSHConfig } from '../services/sshService.js';
import { writeLog } from '../services/logService.js';
import {
  activeProcesses,
  envPorts,
  currentEnv,
  setCurrentEnv,
  saveState,
  isPortOccupied,
  killEnvProcess,
  isServiceRunning
} from '../services/processService.js';
import {
  getCommonEnvs,
  getEnvConfig,
  saveCommonEnvConfig,
  deleteCommonEnvConfig,
  normalizeCredentialFields
} from '../services/envService.js';
import { securityService } from '../services/securityService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ==================== 全局跨项目运行服务扫描 ====================

function getProjectStatePath(projectId) {
  return path.join(CONFIG_DIR, 'projects', projectId, 'state.json');
}

async function getAllRunningServicesGlobally() {
  const allRunning = [];
  try {
    if (fs.existsSync(PROJECTS_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
      const projectsList = data.projects || [];

      for (const proj of projectsList) {
        if (!proj.id) continue;
        const projectStatePath = getProjectStatePath(proj.id);

        if (fs.existsSync(projectStatePath)) {
          try {
            const stateData = JSON.parse(fs.readFileSync(projectStatePath, 'utf-8'));
            const portsDict = stateData.envPorts || {};

            const entries = Object.entries(portsDict).filter(([, port]) => port);
            const results = await Promise.all(
              entries.map(async ([envKey, port]) => {
                const occupied = await isPortOccupied(port);
                return { envKey, port, occupied };
              })
            );

            for (const { envKey, port, occupied } of results) {
              if (occupied) {
                allRunning.push({
                  projectName: proj.name,
                  envName: envKey,
                  port: port
                });
              }
            }
          } catch (e) {
            console.error(`[DevAssistant] 读取项目 [${proj.name}] 状态失败:`, e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[DevAssistant] 全局扫描项目已运行服务失败:', err.message);
  }
  return allRunning;
}

// ==================== GET /api/envs ====================

router.get('/api/envs', async (req, res) => {
  try {
    const commonEnvs = getCommonEnvs();

    // 收集所有可能用到的端口，一次并发探测
    const portsToProbe = new Set();

    for (const port of Object.values(envPorts)) {
      if (port) portsToProbe.add(Number(port));
    }
    for (const envConf of Object.values(commonEnvs)) {
      if (envConf && envConf.local_port) portsToProbe.add(Number(envConf.local_port));
    }

    const probeResultsArray = await Promise.all(
      Array.from(portsToProbe).map(async (port) => {
        const occupied = await isPortOccupied(port);
        return { port, occupied };
      })
    );

    const portOccupiedMap = {};
    probeResultsArray.forEach(({ port, occupied }) => {
      portOccupiedMap[port] = occupied;
    });

    // 影子端口自愈：同一端口被多个环境认领时只保留获胜者
    const occupiedPorts = {};
    for (const [env, port] of Object.entries(envPorts)) {
      if (port && portOccupiedMap[port]) {
        if (!occupiedPorts[port]) occupiedPorts[port] = [];
        occupiedPorts[port].push(env);
      }
    }

    let hasCleaned = false;
    for (const [port, envList] of Object.entries(occupiedPorts)) {
      if (envList.length > 1) {
        let winner = envList.find(e => activeProcesses[e]);
        if (!winner) winner = envList.find(e => e === currentEnv);
        if (!winner) winner = envList[envList.length - 1];

        envList.forEach(e => {
          if (e !== winner) {
            delete envPorts[e];
            hasCleaned = true;
          }
        });
      }
    }

    if (hasCleaned) {
      saveState();
    }

    // 组装环境卡片：一个 envName 一张卡片
    const mappedEnvs = {};
    for (const [envName, envConf] of Object.entries(commonEnvs)) {
      const port = envPorts[envName] || null;
      const running = port ? !!portOccupiedMap[port] : false;

      mappedEnvs[envName] = {
        ...envConf,
        running,
        port: port || null
      };
    }

    res.json({
      envs: mappedEnvs,
      server_ssh: getGlobalSSHConfig(),
      currentEnv,
      isRunning: Object.values(mappedEnvs).some(e => e.running),
      allRunningServices: await getAllRunningServicesGlobally()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== POST /api/envs/add ====================

router.post('/api/envs/add', (req, res) => {
  const { envKey, config } = req.body;
  if (!envKey || !config) {
    return res.status(400).json({ error: '环境标识与配置内容不能为空' });
  }

  const cleanEnvKey = envKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!cleanEnvKey) {
    return res.status(400).json({ error: '无效的环境标识，必须由字母、数字或划线组成' });
  }

  try {
    const allEnvs = getCommonEnvs();
    if (allEnvs[cleanEnvKey]) {
      return res.status(400).json({ error: `环境标识 [${cleanEnvKey}] 已存在` });
    }

    saveCommonEnvConfig(cleanEnvKey, {
      ...config,
      credentials: normalizeCredentialFields(config.credentials || [])
    });

    res.json({ success: true, message: `环境 [${cleanEnvKey}] 已成功新增并保存！` });
  } catch (err) {
    res.status(500).json({ error: '新增环境失败: ' + err.message });
  }
});

// ==================== POST /api/envs/edit ====================

router.post('/api/envs/edit', (req, res) => {
  const { oldEnvKey, newEnvKey, config } = req.body;
  if (!oldEnvKey || !newEnvKey || !config) {
    return res.status(400).json({ error: '原标识、新标识与配置内容不能为空' });
  }

  const cleanNewKey = newEnvKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!cleanNewKey) {
    return res.status(400).json({ error: '无效的新环境标识，必须由字母、数字或划线组成' });
  }

  try {
    const allEnvs = getCommonEnvs();
    if (!allEnvs[oldEnvKey]) {
      return res.status(404).json({ error: `未找到要编辑的环境 [${oldEnvKey}]` });
    }

    // 如果改名了，检查新名字是否冲突
    if (oldEnvKey !== cleanNewKey && allEnvs[cleanNewKey]) {
      return res.status(400).json({ error: `新环境标识 [${cleanNewKey}] 已存在` });
    }

    // 改名：迁移运行状态与保险库密钥
    if (oldEnvKey !== cleanNewKey) {
      if (activeProcesses[oldEnvKey]) {
        activeProcesses[cleanNewKey] = activeProcesses[oldEnvKey];
        delete activeProcesses[oldEnvKey];
      }
      if (envPorts[oldEnvKey]) {
        envPorts[cleanNewKey] = envPorts[oldEnvKey];
        delete envPorts[oldEnvKey];
      }
      if (currentEnv === oldEnvKey) {
        setCurrentEnv(cleanNewKey);
        saveState();
      }
      // 删除旧环境的保险库数据
      const activeProj = getActiveProject();
      const pid = (activeProj && activeProj.id) ? activeProj.id : 'default';
      const oldScope = `${pid}#${oldEnvKey}`;
      const fields = normalizeCredentialFields(config.credentials || []);
      fields.forEach(f => securityService.deleteSecret(oldScope, f.key));
      securityService.deleteSecret(oldScope, 'online_password');
      // 删除旧环境配置
      deleteCommonEnvConfig(oldEnvKey);
    }

    saveCommonEnvConfig(cleanNewKey, {
      ...config,
      credentials: normalizeCredentialFields(config.credentials || [])
    });

    res.json({ success: true, message: `环境 [${cleanNewKey}] 的配置已成功修改！` });
  } catch (err) {
    res.status(500).json({ error: '修改环境配置失败: ' + err.message });
  }
});

// ==================== POST /api/envs/delete ====================

router.post('/api/envs/delete', (req, res) => {
  const { envKey } = req.body;
  if (!envKey) {
    return res.status(400).json({ error: '未指定要删除的环境标识' });
  }

  try {
    const allEnvs = getCommonEnvs();
    if (!allEnvs[envKey]) {
      return res.status(404).json({ error: `未找到环境 [${envKey}]` });
    }

    // 强杀该环境正在运行的子服务进程
    killEnvProcess(envKey);

    // 清理内存字典
    delete envPorts[envKey];
    if (currentEnv === envKey) {
      setCurrentEnv('');
      saveState();
    }

    deleteCommonEnvConfig(envKey);

    res.json({ success: true, message: `环境 [${envKey}] 已成功安全彻底删除！` });
  } catch (err) {
    res.status(500).json({ error: '删除环境配置失败: ' + err.message });
  }
});

// ==================== POST /api/envs/autologin ====================

router.post('/api/envs/autologin', (req, res) => {
  const { envKey } = req.body;
  if (!envKey) {
    return res.status(400).json({ error: '未指定要自动登录的环境' });
  }

  const envName = envKey; // 不再拆分 @子项目

  try {
    const envConfig = getEnvConfig(envName);
    if (!envConfig) {
      return res.status(404).json({ error: `未找到环境 [${envName}] 的配置` });
    }

    const { login_url, online_username, online_password, login_browser, credentials } = envConfig;
    if (!login_url || !online_username || !online_password) {
      return res.status(400).json({ error: '该环境尚未配置完整的自动登录参数（需提供登录地址、线上账号与密码）' });
    }

    const pyScriptPath = path.join(__dirname, '..', '..', 'scripts', 'auto_login.py');
    const configPayload = JSON.stringify({
      login_url,
      online_username,
      online_password,
      login_browser: login_browser || 'chrome',
      credentials: credentials || []
    });

    writeLog(`[AutoLogin] 🚀 正在调起后台 Python-Playwright 自动填密登录，直达链接: ${login_url}`, envKey, 'System');

    const pyProcess = spawn('python', [pyScriptPath, configPayload]);

    pyProcess.stdout.on('data', (data) => {
      const logMsg = data.toString('utf-8').trim();
      if (logMsg) writeLog(logMsg, envKey, 'AutoLogin');
    });

    pyProcess.stderr.on('data', (data) => {
      const errMsg = data.toString('utf-8').trim();
      if (errMsg) writeLog(`[错误] ${errMsg}`, envKey, 'AutoLogin');
    });

    pyProcess.on('close', (code) => {
      writeLog(`[AutoLogin] 调试进程执行完毕，状态码: ${code}`, envKey, 'System');
    });

    res.json({ success: true, message: '自动登录后台浏览器引擎已成功启动！请随时在右侧"终端日志"中查看具体调试与运行进度。' });
  } catch (err) {
    res.status(500).json({ error: '启动自动登录失败: ' + err.message });
  }
});

export default router;
