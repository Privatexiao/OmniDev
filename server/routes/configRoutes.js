/**
 * @file server/routes/configRoutes.js
 * @description 团队协作配置安全导入/导出路由。支持对项目环境与凭证架构的一键同步与物理安全脱敏过滤。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { CONFIG_DIR, PROJECTS_FILE_PATH, getActiveProject } from '../config/pathConfig.js';
import { getCommonEnvsConfig, normalizeCredentialFields, getCommonEnvs } from '../services/envService.js';
import { securityService } from '../services/securityService.js';

const router = express.Router();

function getDefaultExportDir() {
  const downloads = path.join(os.homedir(), 'Downloads');
  return fs.existsSync(downloads) ? downloads : os.homedir();
}

// ==================== 导出 ====================

router.get('/api/config/export', (req, res) => {
  try {
    const includePrivacy = req.query.includePrivacy === 'true';
    // 若导出隐私数据，需从 getCommonEnvs 中读取已解密的密码和凭证
    const commonEnvs = getCommonEnvs();

    const exportedEnvs = {};
    for (const [envKey, envVal] of Object.entries(commonEnvs)) {
      const creds = normalizeCredentialFields(envVal.credentials || []);
      exportedEnvs[envKey] = {
        VUE_DEV_HOST: envVal.VUE_DEV_HOST || '',
        company_name: envVal.company_name || '',
        remote_dir: envVal.remote_dir || '',
        local_port: envVal.local_port || null,
        login_url: envVal.login_url || '',
        online_username: includePrivacy ? (envVal.online_username || '') : '',
        online_password: includePrivacy ? (envVal.online_password || '') : '',
        login_browser: envVal.login_browser || 'chrome',
        disable_branch: envVal.disable_branch || false,
        start_cmd: envVal.start_cmd || '',
        credentials: creds.map(f => ({
          key: f.key,
          value: includePrivacy ? (f.value || '') : '',
          inject_type: f.inject_type
        }))
      };
    }

    const activeProj = getActiveProject();
    const sourceName = (activeProj && activeProj.name) ? activeProj.name : '';

    const payload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      _sourceName: sourceName,
      envs: exportedEnvs
    };

    let targetDir = getDefaultExportDir();
    const customDir = (req.query.dir || '').toString().trim();
    if (customDir) {
      try {
        fs.mkdirSync(customDir, { recursive: true });
        targetDir = customDir;
      } catch (e) {
        return res.status(400).json({ error: `指定的导出目录无法创建或访问：${e.message}` });
      }
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `omnidev-team-config-${timestamp}.json`;
    const filePath = path.join(targetDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    res.json({ success: true, fileName, path: filePath });
  } catch (err) {
    res.status(500).json({ error: '导出团队配置失败: ' + err.message });
  }
});

// ==================== 默认导出目录 ====================

router.get('/api/config/default-export-dir', (req, res) => {
  res.json({ dir: getDefaultExportDir() });
});

// ==================== 系统文件夹选择器 ====================

router.post('/api/config/pick-folder', (req, res) => {
  if (process.platform === 'win32') {
    const psScript = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$f.Description = "选择 OmniDev 配置导出目录"',
      '$f.ShowNewFolderButton = $true',
      '$top = New-Object System.Windows.Forms.Form',
      '$top.TopMost = $true',
      'if ($f.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }'
    ].join('; ');
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', psScript], { windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      if (err) {
        return res.status(500).json({ error: '调起文件夹选择器失败：' + err.message });
      }
      const dir = (stdout || '').trim();
      res.json({ cancelled: !dir, dir });
    });
  } else if (process.platform === 'darwin') {
    const osa = 'POSIX path of (choose folder with prompt "选择 OmniDev 配置导出目录")';
    execFile('osascript', ['-e', osa], (err, stdout) => {
      if (err) {
        return res.json({ cancelled: true, dir: '' });
      }
      res.json({ cancelled: false, dir: (stdout || '').trim() });
    });
  } else {
    res.status(501).json({ error: '当前操作系统暂不支持图形化目录选择，请手动输入导出目录路径。' });
  }
});

// ==================== 打开系统文件管理器 ====================

router.post('/api/config/open-folder', (req, res) => {
  const target = (req.body && req.body.path ? String(req.body.path) : '').trim();
  if (!target) {
    return res.status(400).json({ error: '缺少要打开的路径' });
  }
  let dir = target;
  try {
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      dir = path.dirname(target);
    }
  } catch (e) {
    return res.status(400).json({ error: '路径不存在或无法访问：' + e.message });
  }

  let cmd, args;
  if (process.platform === 'win32') {
    cmd = 'explorer.exe';
    args = [dir];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [dir];
  } else {
    cmd = 'xdg-open';
    args = [dir];
  }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {});
    child.unref();
    res.json({ success: true, dir });
  } catch (e) {
    res.status(500).json({ error: '打开文件夹失败：' + e.message });
  }
});

// ==================== 导入 ====================

router.post('/api/config/import', (req, res) => {
  const { configData, projectName, projectPath } = req.body;
  if (!configData || !configData.envs) {
    return res.status(400).json({ error: '无效 of OmniDev 导入包，必须包含完整的 envs 属性定义' });
  }
  const name = (projectName || '').trim();
  if (!name) {
    return res.status(400).json({ error: '请输入新项目名称' });
  }

  try {
    let projectsData;
    try {
      projectsData = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
    } catch (e) {
      return res.status(500).json({ error: '读取项目清单失败：' + e.message });
    }

    const cleanId = name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_').replace(/_+/g, '_');
    if (!cleanId || projectsData.projects.some(p => p.id === cleanId)) {
      return res.status(400).json({ error: `项目名称 "${name}" 对应的 ID [${cleanId}] 已存在，请换一个名称` });
    }

    const cleanPath = projectPath ? path.normalize(projectPath.trim()) : '';

    const newProject = { id: cleanId, name, path: cleanPath };
    projectsData.projects.push(newProject);
    fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(projectsData, null, 2), 'utf-8');

    // 为新项目创建独立配置目录并写入 envs（凭证内联，脱敏）
    const newProjectConfigDir = path.join(CONFIG_DIR, 'projects', cleanId);
    const newEnvFilePath = path.join(newProjectConfigDir, 'envs_common.json');
    fs.mkdirSync(newProjectConfigDir, { recursive: true });

    const envsPayload = { envs: {} };
    for (const [envKey, envVal] of Object.entries(configData.envs)) {
      const creds = normalizeCredentialFields(envVal.credentials || []);

      // 若导入文件中带有隐私凭据，将其写入新项目的独立加密保险库命名空间中
      const scope = `${cleanId}#${envKey}`;
      if (envVal.online_password) {
        securityService.saveSecret(scope, 'online_password', envVal.online_password);
      }
      creds.forEach(f => {
        if (f.value) {
          securityService.saveSecret(scope, f.key, f.value);
        }
      });

      envsPayload.envs[envKey] = {
        VUE_DEV_HOST: envVal.VUE_DEV_HOST || '',
        company_name: envVal.company_name || '',
        remote_dir: envVal.remote_dir || '',
        local_port: envVal.local_port || null,
        login_url: envVal.login_url || '',
        online_username: envVal.online_username || '',
        online_password: '',
        login_browser: envVal.login_browser || 'chrome',
        start_cmd: envVal.start_cmd || '',
        node_version: envVal.node_version || '',
        credentials: creds.map(f => ({ key: f.key, value: '', inject_type: f.inject_type })),
        ...(envVal.disable_branch ? { disable_branch: true } : {}),
        ...(envVal.disable_start ? { disable_start: true } : {})
      };
    }
    fs.writeFileSync(newEnvFilePath, JSON.stringify(envsPayload, null, 2), 'utf-8');

    const newStatePath = path.join(newProjectConfigDir, 'state.json');
    fs.writeFileSync(newStatePath, JSON.stringify({}, null, 2), 'utf-8');

    const envNames = Object.keys(configData.envs);

    res.json({
      success: true,
      project: { id: cleanId, name, path: cleanPath },
      envCount: envNames.length,
      envNames,
      message: `已成功创建新项目「${name}」并导入 ${envNames.length} 个环境定义。`
    });
  } catch (err) {
    res.status(500).json({ error: '创建新项目并导入配置失败: ' + err.message });
  }
});

// ==================== 打开系统浏览器访问 URL ====================
router.post('/api/system/open-url', (req, res) => {
  const url = (req.body && req.body.url ? String(req.body.url) : '').trim();
  if (!url) {
    return res.status(400).json({ error: '缺少要打开的 URL' });
  }

  let cmd, args;
  if (process.platform === 'win32') {
    cmd = 'cmd.exe';
    // 💡 Windows 使用 cmd.exe /c start "" "url" 能最安全且兼容地拉起默认浏览器并避免特殊字符截断
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {});
    child.unref();
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ error: '无法打开 URL: ' + e.message });
  }
});

export default router;
