/**
 * @file server/routes/startRoutes.js
 * @description 前端本地开发服务控制路由。提供一键启动、端口分配、影子自愈和精准/全局关闭等操作。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import { getActiveProject } from '../config/pathConfig.js';
import { getGlobalSSHConfig } from '../services/sshService.js';
import { appConfig } from '../services/projectService.js';
import { getEnvConfig } from '../services/envService.js';
import { writeLog, getFormattedDate, cleanOldLogs, buildLogFilePath } from '../services/logService.js';
import {
  envPorts,
  activeProcesses,
  currentEnv,
  setCurrentEnv,
  saveState,
  killEnvProcess,
  killActiveProcess,
  getFirstFreePort,
  isPortOccupied,
  isPortAvailableAsync
} from '../services/processService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

function resolveNpmRunCommand(targetWorkingDir, envName) {
  const pkgPath = path.join(targetWorkingDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return `npm run dev`;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg.scripts || {};
    const candidates = [`dev:${envName}`, envName, 'dev', 'serve', 'start'];
    const matchedScript = candidates.find(script => scripts[script]);
    return `npm run ${matchedScript || 'dev'}`;
  } catch (e) {
    return `npm run dev`;
  }
}

/**
 * 跨平台本地开发服务启动执行器。
 * 支持：
 * 1. Windows: 弹出物理独立的 PowerShell 终端并输出日志落盘（体验极佳）。
 * 2. macOS: 利用 AppleScript 自动拉起原生 Terminal 并实时输出日志落盘。
 * 3. Linux/WSL: 在后台以物理隔离子进程形式运行，并重定向输出流至日志文件。
 */
function runLocalCommandCrossPlatform(targetWorkingDir, envName, assignedPort, envVars, runCommand, logFilePath, dateStr, customNodeVersion) {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  // 🚀 智能探测子项目所要求的 Node 版本
  let nodeVersion = customNodeVersion ? String(customNodeVersion).trim() : null;
  
  if (!nodeVersion) {
    try {
    const nvmrcPath = path.join(targetWorkingDir, '.nvmrc');
    if (fs.existsSync(nvmrcPath)) {
      const buffer = fs.readFileSync(nvmrcPath);
      let v = '';
      if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        v = buffer.toString('utf16le');
      } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        // UTF-16 BE 翻转奇偶字节后按 utf16le 读取
        const swapped = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length - 1; i += 2) {
          swapped[i] = buffer[i + 1];
          swapped[i + 1] = buffer[i];
        }
        v = swapped.toString('utf16le');
      } else if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        v = buffer.slice(3).toString('utf-8');
      } else {
        v = buffer.toString('utf-8');
      }
      
      // 清除一切 \0 字符及多余空白
      v = v.replace(/\0/g, '').trim();
      
      // 🛡️ 正则强力抽取纯净的版本号格式 (例如 16.17.0)，彻底过滤任何可能夹带的乱码或 BOM 符号
      const nodeMatch = v.match(/v?(\d+(?:\.\d+)*)/);
      if (nodeMatch) {
        nodeVersion = nodeMatch[1];
      }
    } else {
      const pkgPath = path.join(targetWorkingDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.engines && pkg.engines.node) {
          const match = pkg.engines.node.match(/(\d+\.\d+\.\d+)/);
          if (match) nodeVersion = match[1];
        }
      }
    }
  } catch (err) {
    console.error('[OmniDev NodeSwitch] 探测项目 Node 版本失败:', err.message);
  }
  }

  if (nodeVersion) {
    writeLog(`[NodeSwitch] 🚀 检测到当前子项目要求使用 Node 版本 [${nodeVersion}]，正在启动 fnm 运行沙箱进行自适应切换`, envName, 'System');
  }

  const mergedEnv = {
    ...process.env,
    ...envVars,
    PORT: String(assignedPort),
    NODE_ENV: 'development'
  };

  if (isWin) {
    const powershellEnvInjections = Object.entries(envVars)
      .map(([key, val]) => `$env:${key}='${val.replace(/'/g, "''")}'`)
      .join('; ');

    // 🚀 在 PowerShell 中前置 fnm use 并开启 quiet 静默模式以彻底消除 ANSI 颜色控制码乱码
    const fnmPrefix = nodeVersion ? `try { fnm use ${nodeVersion} --log-level quiet } catch {}; ` : '';

    const envCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; ${fnmPrefix}${powershellEnvInjections ? powershellEnvInjections + '; ' : ''}${runCommand} | ForEach-Object { Write-Host $_; $_ } | Out-File -FilePath '${logFilePath}' -Encoding utf8 -Append; Read-Host '----------------------------------------\n[OmniDev] 服务已停止或运行结束，请检查上方日志。按回车键(Enter)关闭此窗口'`;
    const escapedEnvCommand = envCommand.replace(/\$/g, '`$');

    return spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "${escapedEnvCommand.replace(/"/g, '`"')}"`
    ], {
      cwd: targetWorkingDir
    });
  } else if (isMac) {
    // macOS 环境：利用 AppleScript 自动打开一个独立的 Terminal 窗口
    const envInjections = Object.entries(envVars)
      .map(([key, val]) => `${key}=${JSON.stringify(val)}`)
      .join(' ');

    // 🚀 在 sh/bash 中前置 fnm use 并开启 quiet 静默模式以彻底消除 ANSI 颜色控制码乱码
    const fnmPrefix = nodeVersion ? `(fnm use ${nodeVersion} --log-level quiet || true) && ` : '';

    const appleScriptCmd = `tell application "Terminal"
      activate
      do script "cd ${JSON.stringify(targetWorkingDir)} && ${fnmPrefix}env PORT=${assignedPort} NODE_ENV=development ${envInjections} ${runCommand} 2>&1 | tee ${JSON.stringify(logFilePath)}; echo '----------------------------------------'; echo '[OmniDev] 服务已运行结束。按回车键关闭此窗口'; read"
    end tell`;

    exec(`osascript -e ${JSON.stringify(appleScriptCmd)}`, (err) => {
      if (err) {
        console.error('[OmniDev macOS] 启动 Terminal 失败，将直接降级运行:', err);
      }
    });

    // 同时启动一个静默后台子进程，方便 OmniDev 控制台强行杀死与跟踪运行状态
    return spawn('/bin/sh', ['-c', `exec ${fnmPrefix}env PORT=${assignedPort} NODE_ENV=development ${envInjections} ${runCommand} >> ${JSON.stringify(logFilePath)} 2>&1`], {
      cwd: targetWorkingDir,
      env: mergedEnv
    });
  } else {
    // Linux/WSL 环境：以静默后台子进程启动，通过 Shell 包装方便输出直接重定向落盘
    const envInjections = Object.entries(envVars)
      .map(([key, val]) => `${key}=${JSON.stringify(val)}`)
      .join(' ');

    // 🚀 在 sh/bash 中前置 fnm use 并开启 quiet 静默模式以彻底消除 ANSI 颜色控制码乱码
    const fnmPrefix = nodeVersion ? `(fnm use ${nodeVersion} --log-level quiet || true) && ` : '';
    
    return spawn('/bin/sh', ['-c', `exec ${fnmPrefix}env PORT=${assignedPort} NODE_ENV=development ${envInjections} ${runCommand} >> ${JSON.stringify(logFilePath)} 2>&1`], {
      cwd: targetWorkingDir,
      env: mergedEnv
    });
  }
}

// 一键启动/切换本地开发服务 (支持多环境并行启动，端口自增 8080+ 并物理隔离日志)
router.post('/api/start', async (req, res) => {
  const { env } = req.body;
  if (!env) return res.status(400).json({ error: '未指定环境' });

  // 环境名即 env 本身，不再拆分 @子项目
  const envName = env;
  const envConfig = getEnvConfig(envName);

  if (envConfig && envConfig.disable_start) {
    return res.status(400).json({ error: '当前环境已禁用本地开发服务启动' });
  }


  // 1. 动态探测并分配第一个闲置可用端口
  // 🔒 统一使用物理环境名 envName 管理本地进程与端口，让子项目共享控制台状态与端口映射
  let assignedPort = envPorts[envName];
  const isCurrentlyRunning = assignedPort ? await isPortOccupied(assignedPort) : false;

  // 如果这个指定环境已经在运行了，先精准强杀该环境的残留进程实现一键“重启”
  if (isCurrentlyRunning) {
    killEnvProcess(envName);
  }

  // 重新分配并保存新端口
  let targetPort = null;
  if (envConfig && envConfig.local_port) {
    const customPort = parseInt(envConfig.local_port, 10);
    if (customPort && !isNaN(customPort)) {
      targetPort = customPort;
    }
  }

  // 🔒 优先使用用户设定的专属固定端口（带安全前置冲突检测）；否则动态分配第一个闲置可用端口
  if (targetPort) {
    const isAvailable = await isPortAvailableAsync(targetPort);
    if (!isAvailable) {
      return res.status(400).json({ 
        error: `启动失败：该环境配置的固定端口 ${targetPort} 当前已被本地其他系统进程占用，请先释放端口或在设置中换用其他端口！` 
      });
    }
    assignedPort = targetPort;
  } else {
    assignedPort = await getFirstFreePort(appConfig.defaultPort || 8080);
  }
  
  // 🔒 端口排他性保障：若其他闲置环境在 envPorts 中残留了相同的历史端口，立即将其清除，彻底解决影子启用误判 Bug
  for (const [name, port] of Object.entries(envPorts)) {
    if (name !== envName && port === assignedPort) {
      delete envPorts[name];
    }
  }
  
  envPorts[envName] = assignedPort;
  
  setCurrentEnv(envName); // 统一使用物理环境名
  saveState();

  const activeProj = getActiveProject();
  if (!activeProj || !activeProj.path) {
    return res.status(400).json({ error: '请先在控制台中添加并激活一个项目，再尝试启动环境' });
  }

  try {
    // 初始化该环境专属的独立本地日志文件
    const logDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const dateStr = getFormattedDate();
    // 🗂️ 日志文件名以「项目 + 环境」隔离命名，避免跨项目同名环境抢占同一日志文件
    const logFilePath = buildLogFilePath('local', envName, dateStr);
    
    // 每次启动服务清除上一次日志 (即覆写清空今日该环境 of 本地日志文件，保障启动状态干净)
    // 🛡️ Windows 下若上一轮服务窗口仍以 Out-File/tee 占用该日志文件，截断写入会抛 EBUSY；
    //    此时降级为「不清空、直接追加」，避免整个启动流程被文件锁打断。
    try {
      fs.writeFileSync(logFilePath, '', 'utf-8');
    } catch (clearErr) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(clearErr.code)) {
        console.warn(`[OmniDev] 今日日志文件被占用，跳过清空直接续写: ${logFilePath} (${clearErr.code})`);
      } else {
        throw clearErr;
      }
    }
    writeLog(`--- 🚀 开始启动本地前端开发服务，分配本地端口: ${assignedPort} ---`, envName, 'Startup', 'local');
    
    // 执行滚动删除，只保留最近3天的日志文件
    cleanOldLogs(envName);

    // 🚀 cwd 用户登记的项目工作目录本身
    let targetWorkingDir = activeProj.path;

    // 💡 智能路径自愈：如果工作目录下没有有效 package.json 或者 package.json 中没有找到适配的启动脚本，
    //    但是子目录 manage 下有 package.json，并且能匹配到脚本，我们自动深入 manage 目录
    if (fs.existsSync(targetWorkingDir) && fs.existsSync(path.join(targetWorkingDir, 'manage', 'package.json'))) {
      const managePkgPath = path.join(targetWorkingDir, 'manage', 'package.json');
      let shouldFallbackToManage = false;
      
      const rootPkgPath = path.join(targetWorkingDir, 'package.json');
      if (!fs.existsSync(rootPkgPath)) {
        shouldFallbackToManage = true;
      } else {
        try {
          const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
          const rootScripts = rootPkg.scripts || {};
          const candidates = [`dev:${envName}`, envName, 'dev', 'serve', 'start'];
          const rootHasScript = candidates.some(script => rootScripts[script]);
          if (!rootHasScript) {
            shouldFallbackToManage = true;
          }
        } catch (e) {
          shouldFallbackToManage = true;
        }
      }

      if (shouldFallbackToManage) {
        const oldDir = targetWorkingDir;
        targetWorkingDir = path.join(targetWorkingDir, 'manage');
        writeLog(`[NodeSwitch] 💡 检测到根目录无适配开发脚本，自动启动路径自愈：将工作目录切换至前端子项目 [${targetWorkingDir}]`, envName, 'System');
      }
    }

    if (!fs.existsSync(targetWorkingDir)) {
      return res.status(404).json({ error: `无法启动服务：当前激活项目分支物理目录不存在，请检查路径设定: ${targetWorkingDir}` });
    }


    // 🚀 在拉起本地开发服务前，将配置与最新凭证动态编译为进程级别临时环境变量！
    // 🚫 严格遵循“物理只读”原则，绝对不写入或修改目标业务项目下的任何物理文件！
    const envVars = {
      NODE_ENV: 'development',
      PORT: String(assignedPort)
    };

    if (envConfig) {
      try {
        // 仅注入基础 VUE_DEV_HOST
        if (envConfig.VUE_DEV_HOST) {
          envVars.VUE_DEV_HOST = envConfig.VUE_DEV_HOST;
        }
        

        writeLog(`已成功在内存中动态生成进程级临时环境变量并绑定端口 [${assignedPort}] (严格物理只读，未修改任何物理文件)`, envName, 'System');
      } catch (envInjectErr) {
        writeLog(`动态生成进程环境变量失败: ${envInjectErr.message}`, envName, 'Warning');
      }
    }

    // 2. 智能 NPM 启动脚本匹配
    let runCommand = envConfig && envConfig.start_cmd ? envConfig.start_cmd.trim() : '';
    if (runCommand) {
      writeLog(`启动脚本使用用户自定义命令: ${runCommand}`, envName, 'System');
    } else {
      runCommand = resolveNpmRunCommand(targetWorkingDir, envName);
      writeLog(`启动脚本自动选择: ${runCommand}`, envName, 'System');
    }

    // 🚀 跨平台执行命令拉起，彻底剥离 .ps1，在多 OS 下自动分配适配的运行逻辑
    const childProc = runLocalCommandCrossPlatform(
      targetWorkingDir,
      envName,
      assignedPort,
      envVars,
      runCommand,
      logFilePath,
      dateStr,
      envConfig ? envConfig.node_version : null
    );

    // 独立托管当前启动环境的进程
    activeProcesses[envName] = childProc;

    writeLog(`已成功拉起前端开发服务，本地端口: ${assignedPort}，日志已实时落盘: logs/${path.basename(logFilePath)}`, envName, 'System');

    res.json({ success: true, message: `环境 [${envName}] 已成功启动，已分配本地端口: ${assignedPort}`, port: assignedPort });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 强关服务 (支持精准强杀某个环境或者全局自愈强杀)
router.post('/api/stop', (req, res) => {
  const { env } = req.body;
  if (env) {
    killEnvProcess(env);
    res.json({ success: true, message: `环境 [${env}] 已成功关闭` });
  } else {
    killActiveProcess();
    res.json({ success: true, message: '所有本地服务已关闭' });
  }
});

// 占位导出
export default router;
