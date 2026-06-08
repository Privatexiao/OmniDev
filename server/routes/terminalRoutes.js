/**
 * @file server/routes/terminalRoutes.js
 * @description 本地与远程终端自定义指令下发、运行日志检索及清理 API 路由。支持 GBK 乱码自适应修复和 Git 诊断性提示过滤分流。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { getActiveProject } from '../config/pathConfig.js';
import { getRemoteEnvPath, resolveEnvSSHConfig, runRemoteCommand, cachedSSHConn } from '../services/sshService.js';
import { appConfig } from '../services/projectService.js';
import { getEnvConfig } from '../services/envService.js';
import { writeLog, getFormattedDate, appendLogFileAsync, buildLogFilePath, buildLogFilePattern, getLogDir } from '../services/logService.js';
import { currentEnv, isServiceRunning } from '../services/processService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// 解决 Windows 下终端输出 GBK 导致乱码的问题（TextDecoder 为 Node.js 全局对象，无需导入）
function decodeBuffer(buf) {
  if (process.platform !== 'win32') {
    return buf.toString('utf-8');
  }
  try {
    const utf8Str = buf.toString('utf-8');
    // 如果没有 UTF-8 替换字符 \uFFFD，说明是合法的 UTF-8，直接返回
    if (!utf8Str.includes('\uFFFD')) {
      return utf8Str;
    }
    // 存在 \uFFFD，说明有乱码，尝试用 GBK 解码
    const gbkDecoder = new TextDecoder('gbk');
    return gbkDecoder.decode(buf);
  } catch (e) {
    return buf.toString('utf-8');
  }
}

/**
 * 💡 异步读取日志文件的尾部指定字节大小 (100KB)，避免同步大文件读取导致 Node.js 阻塞与前端网络带宽开销
 * @param {string} filePath 日志文件绝对路径
 * @param {number} maxBytes 最大读取字节数，默认 100KB
 * @returns {Promise<string>} 读取到的日志内容
 */
async function readTailOfFileAsync(filePath, maxBytes = 102400) {
  let fileHandle = null;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size <= maxBytes) {
      return await fs.promises.readFile(filePath, 'utf-8');
    }
    fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const position = stat.size - maxBytes;
    await fileHandle.read(buffer, 0, maxBytes, position);
    const rawText = buffer.toString('utf-8');
    const firstNewlineIdx = rawText.indexOf('\n');
    if (firstNewlineIdx !== -1) {
      return rawText.slice(firstNewlineIdx + 1);
    }
    return rawText;
  } catch (err) {
    console.error(`[DevAssistant] 读取日志尾部失败 [${filePath}]:`, err.message);
    throw err;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

// 🖥️ 执行自定义 Shell/Terminal 指令并注入对应 environment 专属日志文件中 (支持按 local/remote 模式拆分落盘)
router.post('/api/terminal/command', async (req, res) => {
  const { command, env, executionMode } = req.body;
  if (!command) return res.status(400).json({ error: '命令内容不能为空' });

  const activeProj = getActiveProject();
  const targetEnv = env || currentEnv;
  const isRemoteMode = executionMode === 'remote';

  // 💡 物理自愈：如果环境名称中带有 @ 符号（如 work@manage），截取并还原为真实的物理环境名（如 work），保证写入和前端轮询日志的文件名完全一致！
  const envName = targetEnv ? targetEnv.split('@')[0] : targetEnv;
  const logEnv = envName || 'default';
  
  const logDir = getLogDir();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const dateStr = getFormattedDate();
  const logType = isRemoteMode ? 'remote' : 'local';
  const logFilePath = buildLogFilePath(logType, logEnv, dateStr);

  if (isRemoteMode) {
    // 🌐 远程 SSH 指令执行模式 (统一写入 remote 日志，页面终端可见)
    const envConfig = getEnvConfig(envName);

    const sshConfig = resolveEnvSSHConfig(envConfig);

    if (!sshConfig || !sshConfig.host || !envConfig || !envConfig.remote_dir) {
      const missingParts = [];
      if (!envConfig) missingParts.push(`环境 [${envName}] 配置未找到`);
      else {
        if (!envConfig.remote_dir) missingParts.push('未配置 remote_dir 远程目录');
      }
      if (!sshConfig) missingParts.push('SSH 连接凭证未配置');
      else {
        if (!sshConfig.host) missingParts.push('SSH 凭证中未配置 host 主机');
      }

      console.warn(`[TerminalRoutes] 远程 SSH 指令前置校验失败 [envName: ${envName}], 缺失: ${missingParts.join(', ')}`);
      return res.status(400).json({ 
        error: `当前环境或服务器未配置远程 SSH 凭证或路径目录，无法执行远程命令！(详情: ${missingParts.join('; ')})` 
      });
    }

    const remoteEnvPath = getRemoteEnvPath(sshConfig, envConfig);
    // 醒目在日志记录下发的远程指令
    writeLog(`🟢 [远程 SSH 端] 下发指令: $ ${command} (工作目录: ${remoteEnvPath})`, logEnv, 'Command', 'remote');

    try {
      // 拼装远程指令：首先 cd 到远程环境绝对路径，然后执行目标命令
      const remoteCmd = `cd ${shellQuote(remoteEnvPath)} && ${command}`;
      
      // 💡 超时保护：使用 Promise.race 增加 12 秒强制熔断机制，防止 SSH 连接挂起或丢包导致请求无期限卡死
      const sshRes = await Promise.race([
        runRemoteCommand(sshConfig, remoteCmd, logEnv, false),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('远程指令执行或服务器响应超时（12秒），请确认您的远程服务器 SSH 凭据配置是否正确，或网络是否通畅')), 12000)
        )
      ]);

      writeLog(`🔚 远程指令执行结束 (退出状态码: ${sshRes.code})`, logEnv, 'Command', 'remote');
      res.json({ success: true, message: `远程指令已在服务器 [${sshConfig.host}] 执行完成！`, code: sshRes.code });
    } catch (err) {
      // 💡 发生超时或连接失败时，主动调用断开清理连接缓存，确保下一次能建立新的干净通道而不被卡死连接堵塞
      try {
        const { disconnectSSH } = await import('../services/sshService.js');
        disconnectSSH();
      } catch (e) {}

      writeLog(`❌ 远程指令执行失败: ${err.message}`, logEnv, 'Command Error', 'remote');
      res.status(500).json({ error: '远程执行失败: ' + err.message });
    }
  } else {
    // 💻 本地 SPAWN 指令执行模式 (写入 local 日志，仅在后台记录不干扰页面)
    // 🚀 工作目录即用户登记的项目工作目录本身，不再追加任何子目录
    let workingDir = (activeProj && activeProj.path) ? activeProj.path : __dirname;

    // 物理目录兜底校验
    if (!fs.existsSync(workingDir)) {
      workingDir = (activeProj && activeProj.path) ? activeProj.path : __dirname;
    }

    // 在日志文件中醒目记录用户下发的指令
    writeLog(`🟢 下发本地终端指令: $ ${command} (工作目录: ${path.basename(workingDir)})`, logEnv, 'Command', 'local');

    try {
      // 通过系统 PATH 中 git.exe 的位置动态定位 Git Bash（兼容任意安装目录）
      let bashExe = null;
      try {
        const gitExePath = (process.env.PATH || '').split(path.delimiter)
          .map(dir => path.join(dir, 'git.exe'))
          .find(p => fs.existsSync(p));
        if (gitExePath) {
          // git.exe 通常在 <GitRoot>/cmd/git.exe，bash.exe 在 <GitRoot>/bin/bash.exe
          const gitRoot = path.resolve(path.dirname(gitExePath), '..');
          const candidate = path.join(gitRoot, 'bin', 'bash.exe');
          if (fs.existsSync(candidate)) bashExe = candidate;
        }
      } catch (e) { /* 定位失败时降级为 PowerShell */ }

      let child;
      if (process.platform === 'win32') {
        if (bashExe) {
          // 使用 Git Bash 执行，grep/awk/sed 等全部原生可用
          child = spawn(bashExe, ['-c', command], {
            cwd: workingDir,
            env: { ...process.env }
          });
        } else {
          // Git Bash 不存在时降级为 PowerShell
          child = spawn('powershell.exe', ['-Command', command], {
            cwd: workingDir,
            env: { ...process.env }
          });
        }
      } else {
        // macOS 或 Linux 直接使用系统的 sh
        child = spawn('sh', ['-c', command], {
          cwd: workingDir,
          env: { ...process.env }
        });
      }

      child.stdout.on('data', (data) => {
        appendLogFileAsync(logFilePath, decodeBuffer(data));
      });

      child.stderr.on('data', (data) => {
        const text = decodeBuffer(data);
        const trimmed = text.trim();
        
        // 🌟 1. 空白阻断过滤：若内容为空（纯空白或换行符），直接拦截，杜绝产生难看的空白红框！
        if (!trimmed) return;
        
        // 🌟 2. 拓宽 Git 诊断/状态/进度类的正常辅助提示，将其从真正的“致命错误”中彻底分流
        const isGitStatusMsg = trimmed.includes('From ') || 
                              trimmed.includes('->') || 
                              trimmed.includes('* [') || 
                              trimmed.includes('Updating ') || 
                              trimmed.includes('Fast-forward') ||
                              trimmed.includes('git pull') ||
                              /^[a-f0-9]{7,}\.\.[a-f0-9]{7,}/i.test(trimmed);
                              
        if (isGitStatusMsg) {
          // 作为普通的标准输出追加写入日志文件（使前端呈现经典翠绿风格，剔除红框警告）
          appendLogFileAsync(logFilePath, text);
        } else {
          // 真正的运行报错，依然保留醒目的 Command Error 红色报警
          writeLog(`⚠️ [错误输出] ${trimmed}`, logEnv, 'Command Error', 'local');
        }
      });

      child.on('close', (code) => {
        writeLog(`🔚 指令执行结束 (退出状态码: ${code})`, logEnv, 'Command', 'local');
      });

      res.json({ success: true, message: `指令 [${command}] 已成功下发至目录 [${path.basename(workingDir)}] 执行！` });
    } catch (err) {
      appendLogFileAsync(logFilePath, `❌ [System Error] 指令拉起失败: ${err.message}\n`);
      res.status(500).json({ error: '服务端执行指令失败: ' + err.message });
    }
  }
});

// 提供经典风格 of 日志数据 (支持分环境专属按天滚动日志文件读取，高效极简返回，支持 remote 与 local 两种类型)
router.get('/api/logs', async (req, res) => {
  const env = req.query.env || currentEnv;
  const type = req.query.type || 'remote'; // 'remote' 或者是 'local'
  const logDir = getLogDir();
  const dateStr = getFormattedDate();

  let prefix = type === 'local' ? 'local' : 'remote';
  let logFilePath = buildLogFilePath(prefix, env, dateStr);

  // 降级策略：如果今日日志文件尚未生成，则读取该环境最新的历史日志文件
  if (!fs.existsSync(logFilePath)) {
    try {
      if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        const pattern = buildLogFilePattern(prefix, env);
        const matchedFiles = [];
        files.forEach(file => {
          const match = file.match(pattern);
          if (match) matchedFiles.push({ filename: file, dateStr: match[1] });
        });
        if (matchedFiles.length > 0) {
          matchedFiles.sort((a, b) => b.dateStr.localeCompare(a.dateStr)); // 降序排列，最新在最前
          logFilePath = path.join(logDir, matchedFiles[0].filename);
        }
      }
    } catch (e) {
      console.error('[DevAssistant] 查找历史日志失败:', e.message);
    }
  }
  
  let logsContent = "";
  if (fs.existsSync(logFilePath)) {
    try {
      logsContent = await readTailOfFileAsync(logFilePath);
      logsContent = logsContent.replace(/^\ufeff/, '');
    } catch (e) {
      logsContent = `[System Error] 读取环境 [${env}] ${type === 'local' ? '本地' : '远程'}日志文件失败: ${e.message}\n`;
    }
  } else {
    logsContent = type === 'local'
      ? `[System] 本地服务控制台就绪，尚未产生任何本地开发日志（请先在卡片中启动开发服务）...\n`
      : `[System] 远程服务端控制台就绪，等待执行远程指令...\n`;
  }
  
  res.json({
    logs: [logsContent],
    isRunning: await isServiceRunning(env),
    isSSHConnected: !!cachedSSHConn,
    currentEnv
  });
});

// 🗑️ 一键物理清空指定环境的历史日志文件 (同时清空 local 与 remote 日志)
router.post('/api/logs/clear', (req, res) => {
  const env = req.body.env || currentEnv;
  const dateStr = getFormattedDate();
  const remoteFilePath = buildLogFilePath('remote', env, dateStr);
  const localFilePath = buildLogFilePath('local', env, dateStr);
  try {
    if (fs.existsSync(remoteFilePath)) {
      fs.writeFileSync(remoteFilePath, '', 'utf-8');
    }
    if (fs.existsSync(localFilePath)) {
      fs.writeFileSync(localFilePath, '', 'utf-8');
    }
    res.json({ success: true, message: `环境 [${env}] 今日日志已成功清空` });
  } catch (err) {
    res.status(500).json({ error: '清空日志失败: ' + err.message });
  }
});

// 占位导出
export default router;
