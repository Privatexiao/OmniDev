/**
 * @file server/routes/configRoutes.js
 * @description 团队协作配置安全导入/导出路由。支持对项目环境与凭证架构的一键同步与物理安全脱敏过滤。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { CONFIG_DIR, PROJECTS_FILE_PATH, APP_CONFIG_PATH, getActiveProject } from '../config/pathConfig.js';
import { getCommonEnvsConfig, normalizeCredentialFields, getCommonEnvs } from '../services/envService.js';
import { securityService } from '../services/securityService.js';
import { clearAppConfigCache } from '../services/projectService.js';
import { loadState } from '../services/processService.js';

const router = express.Router();

function getDefaultExportDir() {
  const downloads = path.join(os.homedir(), 'Downloads');
  return fs.existsSync(downloads) ? downloads : os.homedir();
}

// ==================== 导出 ====================

router.get('/api/config/export', (req, res) => {
  try {
    const includePrivacy = req.query.includePrivacy === 'true';

    // 1. 读取全局 app.json 配置
    let appSettings = {};
    if (fs.existsSync(APP_CONFIG_PATH)) {
      try {
        appSettings = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
      } catch (e) {
        console.error('[Export] 读取全局 app.json 失败:', e.message);
      }
    }

    // 2. 读取项目清单 projects.json
    let projectsList = [];
    let activeProjectId = '';
    if (fs.existsSync(PROJECTS_FILE_PATH)) {
      try {
        const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
        projectsList = data.projects || [];
        activeProjectId = data.activeProjectId || '';
      } catch (e) {
        console.error('[Export] 读取项目清单 projects.json 失败:', e.message);
      }
    }

    const projectsData = {};

    // 3. 循环遍历每个项目并读取其独立的环境和 SSH 远程配置
    for (const proj of projectsList) {
      if (!proj.id) continue;
      const projConfigDir = path.join(CONFIG_DIR, 'projects', proj.id);
      const envsPath = path.join(projConfigDir, 'envs_common.json');
      const sshPath = path.join(projConfigDir, 'ssh.json');

      const projectConfig = {
        envs: {},
        ssh: {}
      };

      // 3.1 读取并脱敏项目环境
      if (fs.existsSync(envsPath)) {
        try {
          const rawEnvsData = JSON.parse(fs.readFileSync(envsPath, 'utf-8'));
          const rawEnvs = rawEnvsData.envs || {};

          for (const [envKey, envVal] of Object.entries(rawEnvs)) {
            const scope = `${proj.id}#${envKey}`;
            const rawCreds = normalizeCredentialFields(envVal.credentials || []);

            // 根据是否包含隐私数据，决定从保险库解密还是抹空
            let onlinePassword = '';
            let creds = [];

            if (includePrivacy) {
              onlinePassword = securityService.getSecret(scope, 'online_password') || envVal.online_password || '';
              creds = rawCreds.map(f => ({
                key: f.key,
                value: securityService.getSecret(scope, f.key) || f.value || '',
                inject_type: f.inject_type,
                enabled: f.enabled !== false
              }));
            } else {
              onlinePassword = '';
              creds = rawCreds.map(f => ({
                key: f.key,
                value: '',
                inject_type: f.inject_type,
                enabled: f.enabled !== false
              }));
            }

            projectConfig.envs[envKey] = {
              VUE_DEV_HOST: envVal.VUE_DEV_HOST || '',
              company_name: envVal.company_name || '',
              remote_dir: envVal.remote_dir || '',
              local_port: envVal.local_port || null,
              login_url: envVal.login_url || '',
              local_login_path: envVal.local_login_path || '',
              online_username: envVal.online_username || '',
              online_password: onlinePassword,
              login_browser: envVal.login_browser || 'chrome',
              disable_branch: !!envVal.disable_branch,
              disable_start: !!envVal.disable_start,
              node_version: envVal.node_version || '',
              start_cmd: envVal.start_cmd || '',
              credentials: creds
            };
          }
        } catch (e) {
          console.error(`[Export] 读取项目 [${proj.name}] 环境配置失败:`, e.message);
        }
      }

      // 3.2 读取并脱敏项目 SSH 配置
      if (fs.existsSync(sshPath)) {
        try {
          const sshConfig = JSON.parse(fs.readFileSync(sshPath, 'utf-8'));
          if (sshConfig && sshConfig.host) {
            projectConfig.ssh = {
              host: sshConfig.host || '',
              port: sshConfig.port || 22,
              username: sshConfig.username || '',
              password: includePrivacy ? (sshConfig.password || '') : '',
              remote_path: sshConfig.remote_path || ''
            };
          }
        } catch (e) {
          console.error(`[Export] 读取项目 [${proj.name}] SSH 配置失败:`, e.message);
        }
      }

      projectsData[proj.id] = projectConfig;
    }

    // 4. 构建终极全量导出包 Payload
    const payload = {
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      includePrivacy,
      appConfig: appSettings,
      projects: projectsList,
      activeProjectId,
      projectsData
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
    const fileName = `omnidev-full-config-${timestamp}.json`;
    const filePath = path.join(targetDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    res.json({ success: true, fileName, path: filePath });
  } catch (err) {
    res.status(500).json({ error: '导出全局团队配置失败: ' + err.message });
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
  if (!configData) {
    return res.status(400).json({ error: '无效的导入包：缺少配置数据' });
  }

  // 判断是大包格式（全量备份恢复）还是旧版单项目格式
  const isFullBackup = !!configData.projectsData;

  if (isFullBackup) {
    // ==================== 全量备份恢复逻辑 ====================
    try {
      let projectsData;
      try {
        projectsData = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
      } catch (e) {
        projectsData = { projects: [], activeProjectId: '' };
      }

      const backupProjects = configData.projects || [];
      const backupProjectsData = configData.projectsData || {};
      let importCount = 0;
      const importedNames = [];

      for (const proj of backupProjects) {
        if (!proj.id || !proj.name) continue;

        // 判断项目 ID 在本地是否已经存在，如果存在则视作更新/覆盖，如果不存在则新增
        const existProj = projectsData.projects.find(p => p.id === proj.id);
        if (!existProj) {
          projectsData.projects.push({
            id: proj.id,
            name: proj.name,
            path: proj.path || ''
          });
        } else {
          // 覆盖已有项目的路径
          if (proj.path) {
            existProj.path = proj.path;
          }
        }

        const projectConfigDir = path.join(CONFIG_DIR, 'projects', proj.id);
        fs.mkdirSync(projectConfigDir, { recursive: true });

        const projData = backupProjectsData[proj.id] || {};

        // A. 写入 envs_common.json
        const envsFilePath = path.join(projectConfigDir, 'envs_common.json');
        const envsPayload = { envs: projData.envs || {} };

        // 提取并保存密码到系统加密保险库（如有）
        for (const [envKey, envVal] of Object.entries(envsPayload.envs)) {
          const scope = `${proj.id}#${envKey}`;
          
          if (envVal.online_password) {
            securityService.saveSecret(scope, 'online_password', envVal.online_password);
          }
          const creds = normalizeCredentialFields(envVal.credentials || []);
          creds.forEach(f => {
            if (f.value) {
              securityService.saveSecret(scope, f.key, f.value);
            }
          });

          // 脱敏物理文件
          envVal.online_password = '';
          envVal.credentials = creds.map(f => ({ key: f.key, value: '', inject_type: f.inject_type, enabled: f.enabled !== false }));
        }

        fs.writeFileSync(envsFilePath, JSON.stringify(envsPayload, null, 2), 'utf-8');

        // B. 写入 ssh.json
        const sshFilePath = path.join(projectConfigDir, 'ssh.json');
        const sshData = projData.ssh || {};
        if (sshData && sshData.host) {
          fs.writeFileSync(sshFilePath, JSON.stringify(sshData, null, 2), 'utf-8');
        }

        // C. 确保 state.json 存在
        const stateFilePath = path.join(projectConfigDir, 'state.json');
        if (!fs.existsSync(stateFilePath)) {
          fs.writeFileSync(stateFilePath, JSON.stringify({}, null, 2), 'utf-8');
        }

        importCount++;
        importedNames.push(proj.name);
      }

      // 如果有全局配置 appConfig
      if (configData.appConfig) {
        try {
          let localAppConfig = {};
          if (fs.existsSync(APP_CONFIG_PATH)) {
            localAppConfig = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
          }
          const nextAppConfig = {
            ...localAppConfig,
            ...configData.appConfig
          };
          fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(nextAppConfig, null, 2), 'utf-8');
        } catch (e) {
          console.error('[Import] 合并全局 appConfig 失败:', e.message);
        }
      }

      // 写入更新后的项目清单 projects.json
      const importedProjectIds = new Set(backupProjects.map(proj => proj.id));
      if (configData.activeProjectId && importedProjectIds.has(configData.activeProjectId)) {
        projectsData.activeProjectId = configData.activeProjectId;
      }
      fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(projectsData, null, 2), 'utf-8');
      clearAppConfigCache();
      loadState();

      res.json({
        success: true,
        isFullBackup: true,
        envCount: importCount,
        envNames: importedNames,
        message: `全量配置恢复成功！已成功导入/同步 ${importCount} 个项目（${importedNames.join(', ')}）。`
      });

    } catch (err) {
      res.status(500).json({ error: '恢复全量备份配置失败: ' + err.message });
    }

  } else {
    // ==================== 原单项目导入逻辑 ====================
    if (!configData.envs) {
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

      const newProjectConfigDir = path.join(CONFIG_DIR, 'projects', cleanId);
      const newEnvFilePath = path.join(newProjectConfigDir, 'envs_common.json');
      fs.mkdirSync(newProjectConfigDir, { recursive: true });

      const envsPayload = { envs: {} };
      for (const [envKey, envVal] of Object.entries(configData.envs)) {
        const creds = normalizeCredentialFields(envVal.credentials || []);

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
          local_login_path: envVal.local_login_path || '',
          online_username: envVal.online_username || '',
          online_password: '',
          login_browser: envVal.login_browser || 'chrome',
          start_cmd: envVal.start_cmd || '',
          node_version: envVal.node_version || '',
          credentials: creds.map(f => ({ key: f.key, value: '', inject_type: f.inject_type, enabled: f.enabled !== false })),
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
        isFullBackup: false,
        project: { id: cleanId, name, path: cleanPath },
        envCount: envNames.length,
        envNames,
        message: `已成功创建新项目「${name}」并导入 ${envNames.length} 个环境定义。`
      });
    } catch (err) {
      res.status(500).json({ error: '创建新项目并导入配置失败: ' + err.message });
    }
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
