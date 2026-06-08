/**
 * @file server/routes/projectRoutes.js
 * @description 项目管理 API 路由。提供项目清单的获取、选中激活、添加、修改与删除服务。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import { PROJECTS_FILE_PATH } from '../config/pathConfig.js';
import { getGlobalSSHConfig } from '../services/sshService.js';
import { loadAppConfig, clearAppConfigCache } from '../services/projectService.js';
import { killActiveProcess, loadState } from '../services/processService.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 获取所有注册项目列表及当前激活项目ID
router.get('/api/projects', (req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_FILE_PATH)) {
      return res.status(404).json({ error: '全局项目定义文件 projects.json 未找到' });
    }
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));

    const globalSsh = getGlobalSSHConfig();
    const enrichedProjects = data.projects.map(proj => {
      return { ...proj, sshHost: globalSsh.host || '' };
    });

    res.json({
      activeProjectId: data.activeProjectId,
      projects: enrichedProjects
    });
  } catch (err) {
    res.status(500).json({ error: '加载项目列表失败: ' + err.message });
  }
});

// 在大盘 Tab 切换项目时，持久化保存激活项目指针并强杀防冲突进程
router.post('/api/projects/select', (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: '未指定激活的项目ID' });

  try {
    if (!fs.existsSync(PROJECTS_FILE_PATH)) {
      return res.status(404).json({ error: '全局项目定义文件 projects.json 未找到' });
    }
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
    const projectExists = data.projects.some(p => p.id === projectId);
    if (!projectExists) {
      return res.status(400).json({ error: `欲切换的项目ID [${projectId}] 不存在，请刷新页面` });
    }

    data.activeProjectId = projectId;
    fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    
    // 💡 切换激活项目时同步清空配置缓存，触发热重载
    clearAppConfigCache();
    
    // 重新加载新激活项目关联的状态文件，并自适应刷新端口分配和活跃环境状态
    loadState();

    res.json({ success: true, activeProjectId: projectId, message: `已成功切换到项目分支: ${projectId}` });
  } catch (err) {
    res.status(500).json({ error: '切换项目失败: ' + err.message });
  }
});

// 支持在大盘端一键添加/登记新项目
router.post('/api/projects/add', (req, res) => {
  const { name, path: rawPath } = req.body;
  if (!name || !rawPath) {
    return res.status(400).json({ error: '项目名称与本地绝对路径不能为空' });
  }

  try {
    if (!fs.existsSync(PROJECTS_FILE_PATH)) {
      return res.status(404).json({ error: '全局项目定义文件 projects.json 未找到' });
    }
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
    
    // 生成干净的小写 ID
    const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!cleanId || data.projects.some(p => p.id === cleanId)) {
      return res.status(400).json({ error: '项目ID生成冲突或名称已存在，请换一个名称' });
    }

    const cleanPath = path.normalize(rawPath.trim());
    let warning = null;
    if (!fs.existsSync(cleanPath)) {
      warning = `本地项目路径不存在 [${cleanPath}]，您可能需要稍后将项目拉取到该地址`;
    }

    const newProject = {
      id: cleanId,
      name: name.trim(),
      path: cleanPath
    };

    data.projects.push(newProject);
    data.activeProjectId = cleanId; // 添加后默认激活选中
    
    fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    // 💡 新增项目并自动激活后，清空配置缓存
    clearAppConfigCache();
    res.json({ success: true, activeProjectId: cleanId, warning, message: `新项目 [${name}] 已成功登记并自动激活切换！` });
  } catch (err) {
    res.status(500).json({ error: '登记新项目失败: ' + err.message });
  }
});

// 修改登记的项目配置
router.post('/api/projects/edit', (req, res) => {
  const { id, name, path: rawPath } = req.body;
  if (!id || !name || !rawPath) {
    return res.status(400).json({ error: '项目ID、名称与本地绝对路径不能为空' });
  }

  try {
    if (!fs.existsSync(PROJECTS_FILE_PATH)) {
      return res.status(404).json({ error: '全局项目定义文件 projects.json 未找到' });
    }
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
    const project = data.projects.find(p => p.id === id);
    if (!project) {
      return res.status(404).json({ error: `未找到 ID 为 [${id}] 的项目配置` });
    }

    const cleanPath = path.normalize(rawPath.trim());
    let warning = null;
    if (!fs.existsSync(cleanPath)) {
      warning = `本地项目路径不存在 [${cleanPath}]，您可能需要稍后将项目拉取到该地址`;
    }

    project.name = name.trim();
    project.path = cleanPath;

    fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    // 💡 编辑项目配置后清空缓存
    clearAppConfigCache();
    res.json({ success: true, warning, message: `项目 [${project.name}] 配置已成功修改！` });
  } catch (err) {
    res.status(500).json({ error: '修改项目失败: ' + err.message });
  }
});

// 删除登记的项目配置
router.post('/api/projects/delete', (req, res) => {
  const { projectId } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: '未指定要删除的项目ID' });
  }

  try {
    if (!fs.existsSync(PROJECTS_FILE_PATH)) {
      return res.status(404).json({ error: '全局项目定义文件 projects.json 未找到' });
    }
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
    const projectIndex = data.projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1) {
      return res.status(404).json({ error: `未找到 ID 为 [${projectId}] 的项目配置` });
    }

    const deletedProject = data.projects[projectIndex];

    // 1. 安全全杀所有可能处于运行中的本地子服务进程，防止端口与物理文件死锁
    killActiveProcess();

    // 2. 从列表中移除项目
    data.projects.splice(projectIndex, 1);

    // 3. 处理当前激活的 activeProjectId 的切换
    if (data.activeProjectId === projectId) {
      if (data.projects.length > 0) {
        data.activeProjectId = data.projects[0].id;
      } else {
        data.activeProjectId = '';
      }
    }

    fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    // 💡 删除项目后清空配置缓存
    clearAppConfigCache();
    res.json({ 
      success: true, 
      activeProjectId: data.activeProjectId,
      message: `项目 [${deletedProject.name}] 已成功删除，所有关联子进程及缓存配置已安全清理！` 
    });
  } catch (err) {
    res.status(500).json({ error: '删除项目失败: ' + err.message });
  }
});

// ⚙️ 获取应用全局基础设置接口 (打通自愈机制，杜绝前端空 404 挂起)
router.get('/api/app-config', (req, res) => {
  try {
    const config = loadAppConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: '获取应用配置失败: ' + err.message });
  }
});

// 💾 保存应用全局基础设置接口
router.post('/api/app-config', (req, res) => {
  try {
    const nextConfig = req.body;
    const CONFIG_DIR = path.dirname(PROJECTS_FILE_PATH);
    const APP_CONFIG_PATH = path.join(CONFIG_DIR, 'app.json');

    let currentConfig = {};
    if (fs.existsSync(APP_CONFIG_PATH)) {
      currentConfig = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
    }

    const merged = {
      ...currentConfig,
      appName: nextConfig.appName || currentConfig.appName || 'Dev Assistant',
      appDescription: nextConfig.appDescription || currentConfig.appDescription || '多环境一键启停与快捷登录控制台',
      primarySubproject: nextConfig.primarySubproject || currentConfig.primarySubproject || 'manage',
      serverPort: parseInt(nextConfig.serverPort, 10) || currentConfig.serverPort || 3300,
      frontendPort: parseInt(nextConfig.frontendPort, 10) || currentConfig.frontendPort || 3000,
      defaultPort: parseInt(nextConfig.defaultPort, 10) || currentConfig.defaultPort || 8080,
      maxPort: parseInt(nextConfig.maxPort, 10) || currentConfig.maxPort || 8150,
      excludeDirs: Array.isArray(nextConfig.excludeDirs) ? nextConfig.excludeDirs : (currentConfig.excludeDirs || []),
      killServerOnClose: nextConfig.killServerOnClose !== undefined ? !!nextConfig.killServerOnClose : (currentConfig.killServerOnClose !== false),
      updateUrl: nextConfig.updateUrl !== undefined ? String(nextConfig.updateUrl).trim() : (currentConfig.updateUrl || ''),
      autoCheckUpdate: nextConfig.autoCheckUpdate !== undefined ? !!nextConfig.autoCheckUpdate : (currentConfig.autoCheckUpdate !== false)
    };

    fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    // 💡 修改全局设置后清空配置缓存
    clearAppConfigCache();
    res.json({ success: true, message: '全局基础设置已成功持久化保存！', config: merged });
  } catch (err) {
    res.status(500).json({ error: '保存应用配置失败: ' + err.message });
  }
});

// ==================== 软件检查更新模块 ====================

const CURRENT_VERSION = '0.1.0';

/**
 * 🚀 原生 Node.js 兼容性 HTTP/HTTPS 请求工具方法，彻底杜绝跨域，免除第三方依赖
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`请求失败，HTTP 状态码: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`解析更新源 JSON 失败: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 🚀 语义化版本号比对算法 (x.y.z 规则)
 */
function isNewerVersion(current, latest) {
  const parse = v => String(v).replace(/^v/i, '').split('.').map(Number);
  const currParts = parse(current);
  const lateParts = parse(latest);
  const length = Math.max(currParts.length, lateParts.length);
  for (let i = 0; i < length; i++) {
    const currNum = currParts[i] || 0;
    const lateNum = lateParts[i] || 0;
    if (lateNum > currNum) return true;
    if (lateNum < currNum) return false;
  }
  return false;
}

// ⚙️ 获取与检查应用更新接口 (支持通过 query 临时覆盖 updateUrl 进行配置测试)
router.get('/api/system/check-update', async (req, res) => {
  try {
    let updateUrl = (req.query.updateUrl || '').toString().trim();
    if (!updateUrl) {
      const config = loadAppConfig();
      updateUrl = config.updateUrl || '';
    }

    // 💡 默认更新源地址兜底（使用 GitHub 托管的 update.json raw 地址占位）
    if (!updateUrl) {
      updateUrl = 'https://raw.githubusercontent.com/Privatexiao/OmniDev/main/update.json';
    }

    // 💡 增加时间戳防缓存机制，彻底解决 GitHub Raw CDN 缓存文件更新延迟的痛点
    const separator = updateUrl.includes('?') ? '&' : '?';
    const cleanUrl = `${updateUrl}${separator}_t=${Date.now()}`;

    const updateData = await httpGet(cleanUrl);
    const latestVersion = updateData.version || '0.0.0';
    const hasUpdate = isNewerVersion(CURRENT_VERSION, latestVersion);

    res.json({
      success: true,
      currentVersion: CURRENT_VERSION,
      latestVersion,
      hasUpdate,
      changelog: updateData.changelog || updateData.notes || '暂无更新日志。',
      downloadUrl: updateData.downloadUrl || (updateData.platforms?.['windows-x86_64']?.url) || ''
    });
  } catch (err) {
    // 💡 开发者调试痛点解决：网络超时或服务未部署等技术报错，在后端命令行终端清晰打印诊断日志
    console.error(`[UpdateService] 检查更新源失败 (${req.query.updateUrl ? '测试源' : '默认源'}):`, err.message);
    
    // 💡 普通用户友好体验：连接失败归为“不能更新”，优雅返回“无更新”的正常JSON，避免前台弹红色报错阻碍体验
    res.json({
      success: true,
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
      changelog: '无法连接到更新服务器。'
    });
  }
});

// ==================== 应用内静默下载与安全覆盖安装 ====================

let downloadProgress = {
  status: 'idle', // 'idle' | 'downloading' | 'completed' | 'error'
  percent: 0,
  total: 0,
  transferred: 0,
  error: null,
  filePath: ''
};

/**
 * 🚀 支持多级重定向 (301/302/307/308) 自动追踪的文件流式下载器
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      // 追踪 HTTP 3xx 跳转以兼容网盘或 GitHub Releases 的 CDN 跳转
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          return downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
        }
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`下载失败，HTTP 状态码: ${res.statusCode}`));
      }

      const total = parseInt(res.headers['content-length'], 10) || 0;
      const file = fs.createWriteStream(destPath);
      let transferred = 0;

      res.on('data', (chunk) => {
        transferred += chunk.length;
        if (onProgress) onProgress({ total, transferred });
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // 物理删除残留垃圾文件
        reject(err);
      });

      res.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}


// 🚀 发起后台静默下载安装包请求
router.post('/api/system/download-update', (req, res) => {
  const { downloadUrl, version } = req.body;
  if (!downloadUrl) return res.status(400).json({ error: '缺少下载链接' });
  
  if (downloadProgress.status === 'downloading') {
    return res.json({ success: true, message: '已经在下载中...' });
  }

  const tempDir = path.join(path.dirname(PROJECTS_FILE_PATH), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 💡 动态分析文件名，支持版本号，并和用户自定义的包命名格式绝对对齐
  let fileName = 'omnidev_setup.exe';
  try {
    const urlObj = new URL(downloadUrl);
    const base = path.basename(urlObj.pathname);
    if (base && base.endsWith('.exe')) {
      fileName = base;
    } else if (version) {
      fileName = `OmniDev_Setup_${version}.exe`;
    }
  } catch (e) {
    if (version) {
      fileName = `OmniDev_Setup_${version}.exe`;
    }
  }

  // 💡 物理安全隔离：下载前先把 temp 目录下任何可能残留的其他旧版 exe 安装包物理删除，防止目录凌乱占用
  try {
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach(f => {
        if (f.endsWith('.exe')) {
          fs.unlinkSync(path.join(tempDir, f));
        }
      });
    }
  } catch (e) {
    console.warn('[Update] 清理旧安装包残留失败:', e.message);
  }

  const destPath = path.join(tempDir, fileName);

  // 初始化状态
  downloadProgress = {
    status: 'downloading',
    percent: 0,
    total: 0,
    transferred: 0,
    error: null,
    filePath: destPath
  };


  // 后台静默执行数据流接收
  downloadFile(downloadUrl, destPath, (p) => {
    downloadProgress.total = p.total;
    downloadProgress.transferred = p.transferred;
    downloadProgress.percent = p.total > 0 ? Math.round((p.transferred / p.total) * 100) : 0;
  }).then(() => {
    downloadProgress.status = 'completed';
    downloadProgress.percent = 100;
  }).catch((err) => {
    downloadProgress.status = 'error';
    downloadProgress.error = err.message;
    console.error('[UpdateService] 下载更新包异常中断:', err.message);
  });

  res.json({ success: true, message: '下载任务已在后台启动' });
});

// 🚀 获取当前后台文件下载的百分比与状态进度
router.get('/api/system/download-progress', (req, res) => {
  res.json(downloadProgress);
});

// 🚀 拉起下载好的安装包并优雅关停当前后端（自动释放3300端口，供覆盖安装）
router.post('/api/system/install-and-exit', (req, res) => {
  const tempDir = path.join(path.dirname(PROJECTS_FILE_PATH), 'temp');
  
  // 💡 优先从内存状态中获取本次下载出的真实绝对物理路径
  let exePath = downloadProgress.filePath;

  // 💡 状态丢失自愈降级：如果服务中途重启导致内存 filePath 丢失，动态去临时目录探测搜索最合理的安装包进行拉起
  if (!exePath || !fs.existsSync(exePath)) {
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        const exeFile = files.find(f => f.endsWith('.exe'));
        if (exeFile) {
          exePath = path.join(tempDir, exeFile);
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (!exePath || !fs.existsSync(exePath)) {
    return res.status(400).json({ error: '未检测到已下载完成的安装包，请重新下载' });
  }


  try {
    // 💡 detached: true 与 child.unref() 彻底切断父子进程血缘，使新进程不随 Node 退出而消亡
    const child = spawn('cmd.exe', ['/c', 'start', '', exePath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();

    res.json({ success: true, message: '已拉起安装向导，正在退出主控端...' });

    // 💡 1秒后强退 Node 进程以释放端口与资源锁定，实现顺滑更新
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (err) {
    res.status(500).json({ error: '拉起安装向导失败: ' + err.message });
  }
});

// 📂 打开本端 Node 服务的日志目录（支持生产 AppData 寻址与开发态 logs 寻址）
router.post('/api/system/open-log-dir', (req, res) => {
  const logDir = process.env.OMNIDEV_APP_DATA_DIR
    ? path.join(process.env.OMNIDEV_APP_DATA_DIR, 'logs')
    : path.resolve(__dirname, '../../logs');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (e) {
    return res.status(500).json({ error: '创建或读取日志目录失败: ' + e.message });
  }

  try {
    let cmd, args;
    if (process.platform === 'win32') {
      cmd = 'explorer.exe';
      args = [logDir];
    } else if (process.platform === 'darwin') {
      cmd = 'open';
      args = [logDir];
    } else {
      cmd = 'xdg-open';
      args = [logDir];
    }
    const child = spawn(cmd, args, { detached: true });
    child.unref();
    res.json({ success: true, message: '已成功打开日志目录' });
  } catch (err) {
    res.status(500).json({ error: '无法打开日志目录: ' + err.message });
  }
});

// 📂 打开安装包所在的临时下载目录，并自动高亮选中安装包文件
router.post('/api/system/open-temp-dir', (req, res) => {
  const tempDir = path.join(path.dirname(PROJECTS_FILE_PATH), 'temp');
  
  // 💡 优先从内存状态中获取本次下载出的真实绝对物理路径
  let exePath = downloadProgress.filePath;

  // 💡 状态丢失自愈降级：如果服务中途重启导致内存 filePath 丢失，动态去临时目录探测搜索最合理的安装包进行高亮
  if (!exePath || !fs.existsSync(exePath)) {
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        const exeFile = files.find(f => f.endsWith('.exe'));
        if (exeFile) {
          exePath = path.join(tempDir, exeFile);
        }
      }
    } catch (e) { /* ignore */ }
  }

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (e) {
    return res.status(500).json({ error: '读取临时下载目录失败: ' + e.message });
  }

  try {
    let cmd, args;
    const hasExe = exePath && fs.existsSync(exePath);
    const targetPath = hasExe ? exePath : tempDir;

    if (process.platform === 'win32') {
      cmd = 'explorer.exe';
      args = hasExe ? [`/select,`, targetPath] : [targetPath];
    } else if (process.platform === 'darwin') {
      cmd = 'open';
      args = [tempDir];
    } else {
      cmd = 'xdg-open';
      args = [tempDir];
    }
    
    const child = (process.platform === 'win32' && hasExe)
      ? spawn('explorer.exe', ['/select,', targetPath], { detached: true })
      : spawn(cmd, args, { detached: true });
      
    child.unref();
    res.json({ success: true, message: '已成功打开安装包所在文件夹', path: targetPath });
  } catch (err) {
    res.status(500).json({ error: '无法打开安装包文件夹: ' + err.message });
  }
});


export default router;
