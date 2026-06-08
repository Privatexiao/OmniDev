/**
 * @file server/routes/sshRoutes.js
 * @description SSH 全局连接与分支管理 API 路由。提供远程分支查询、重置检出、手动断开和全局凭证修改等服务。
 */
import express from 'express';
import {
  getGlobalSSHConfig,
  saveGlobalSSHConfig,
  getRemoteEnvPath,
  resolveEnvSSHConfig,
  runRemoteCommand,
  disconnectSSH,
  cachedSSHConn
} from '../services/sshService.js';
import { appConfig } from '../services/projectService.js';
import { getEnvConfig } from '../services/envService.js';
import { writeLog } from '../services/logService.js';
import { currentEnv } from '../services/processService.js';

const router = express.Router();

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// 获取指定远程环境当前部署的 Git 分支名称
router.get('/api/ssh/branches', async (req, res) => {
  const { env } = req.query;
  if (!env) return res.status(400).json({ error: '未指定环境名称' });

  try {
    const envName = env ? env.split('@')[0] : env;
    const envConfig = getEnvConfig(envName);
    const sshConfig = resolveEnvSSHConfig(envConfig);

    if (!sshConfig || !sshConfig.host || !envConfig || !envConfig.remote_dir) {
      return res.json({ currentBranch: '未配置远程信息' });
    }

    const remoteEnvPath = getRemoteEnvPath(sshConfig, envConfig);

    // 查询当前活跃分支
    const cmd = `cd ${shellQuote(remoteEnvPath)} && git rev-parse --abbrev-ref HEAD`;
    const sshRes = await runRemoteCommand(sshConfig, cmd, env, true);

    if (sshRes.code !== 0) {
      return res.status(500).json({ error: `Git错误 (退出码 ${sshRes.code}): ` + (sshRes.stderr || sshRes.stdout).trim() });
    }

    const currentBranch = sshRes.stdout.trim() || '未知';
    res.json({ success: true, currentBranch });
  } catch (err) {
    res.status(500).json({ error: 'SSH连接或路径错误: ' + err.message });
  }
});

// 在指定远程环境上执行一键物理清理、拉取并 Checkout 切换分支
router.post('/api/ssh/checkout', async (req, res) => {
  const { env, branch } = req.body;
  if (!env || !branch) return res.status(400).json({ error: '环境名称与目标分支名称不能为空' });

  try {
    const envName = env ? env.split('@')[0] : env;
    const envConfig = getEnvConfig(envName);
    const sshConfig = resolveEnvSSHConfig(envConfig);

    if (!sshConfig || !sshConfig.host || !envConfig || !envConfig.remote_dir) {
      return res.status(400).json({ error: '服务器或环境未配置远程信息' });
    }

    const remoteEnvPath = getRemoteEnvPath(sshConfig, envConfig);

    writeLog(`开始在远程开发服务器上执行分支重置、干净拉取并检出切换至分支 [${branch}]...`, env, 'Remote SSH', 'remote');
    
    // 执行一键 git checkout . + git clean -df + git pull + git checkout 加输入的分支进行强力干净切换
    const cmd = `cd ${shellQuote(remoteEnvPath)} && git checkout . && git clean -df && git pull && git checkout ${shellQuote(branch)}`;
    const sshRes = await runRemoteCommand(sshConfig, cmd, env);

    if (sshRes.code !== 0) {
      writeLog(`分支切换执行失败，退出状态码: ${sshRes.code}，错误原因: ${sshRes.stderr || sshRes.stdout}`, env, 'Remote SSH Error', 'remote');
      return res.status(500).json({ error: '切换远程分支失败: ' + (sshRes.stderr || sshRes.stdout) });
    }

    writeLog(`分支重置、拉取与检出切换成功，当前最新分支已变更为: ${branch}`, env, 'Remote SSH', 'remote');
    res.json({ success: true, message: `已成功在远程服务器 [${env}] 中重置并切换分支为: ${branch}` });
  } catch (err) {
    res.status(500).json({ error: '切换远程分支失败: ' + err.message });
  }
});

// 手动测试 SSH 连接服务器（优先用请求传入的参数，否则读已保存配置）
router.post('/api/ssh/test', async (req, res) => {
  try {
    const body = req.body || {};
    let ssh, fromForm = false;
    if (body.host && body.username) {
      fromForm = true;
      // 使用前端传入的临时参数直连测试，不读磁盘
      ssh = {
        host: body.host,
        port: body.port || 22,
        username: body.username,
        password: body.password || ''
      };
    } else {
      ssh = getGlobalSSHConfig();
    }
    if (!ssh || !ssh.host || !ssh.username) {
      return res.status(400).json({ error: '未填写服务器地址或用户名' });
    }
    if (!ssh.password) {
      return res.status(400).json({ error: fromForm ? '请填写登录密码' : '未在当前项目中配置远程服务器登录密码' });
    }
    writeLog(`开始对服务器 [${ssh.host}] 执行手动 SSH 登录连通性测试...`, 'test', 'Test SSH', 'remote');
    const result = await Promise.race([
      runRemoteCommand(ssh, 'whoami && pwd', 'test'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSH 连接超时（20秒），请检查服务器地址与端口是否正确')), 20000))
    ]);
    res.json({ success: true, message: '远程服务器 SSH 登录连通测试成功！', result });
  } catch (err) {
    res.status(500).json({ error: '远程服务器连接失败: ' + err.message });
  }
});

// 手动断开活动的 SSH 缓存长连接
router.post('/api/ssh/disconnect', (req, res) => {
  const success = disconnectSSH();
  if (success) {
    writeLog(`🔌 [System] 用户手动断开了远程 SSH 链接！\n`, currentEnv || 'default', 'System', 'remote');
    return res.json({ success: true, message: '远程服务器已成功断开连接！' });
  }
  res.json({ success: true, message: '当前没有活动的远程连接。' });
});

// 保存全局 SSH 配置
router.post('/api/ssh/config', (req, res) => {
  const ssh = req.body || {};
  const nextConfig = {
    host: String(ssh.host || '').trim(),
    port: Number(ssh.port || 22),
    username: String(ssh.username || '').trim(),
    password: String(ssh.password || ''),
    remote_path: String(ssh.remote_path || '').trim()
  };

  if (!nextConfig.host || !nextConfig.username || !nextConfig.password) {
    return res.status(400).json({ error: '服务器地址、用户名、密码不能为空' });
  }
  if (!nextConfig.port || !Number.isInteger(nextConfig.port) || nextConfig.port <= 0 || nextConfig.port > 65535) {
    return res.status(400).json({ error: 'SSH 端口必须是 1-65535 之间的整数' });
  }

  try {
    saveGlobalSSHConfig(nextConfig);
    res.json({ success: true, server_ssh: nextConfig, message: '当前项目独立 SSH 配置已保存成功！' });
  } catch (err) {
    res.status(500).json({ error: '保存 SSH 配置失败: ' + err.message });
  }
});

export default router;
