/**
 * @file projectService.js
 * @description 项目管理服务。负责管理 `projects.json` 中的全局注册项目清单，处理项目的一键登记、编辑、删除与激活态切换。
 */
import fs from 'fs';
import path from 'path';
import { PROJECTS_FILE_PATH, getActiveProject } from '../config/pathConfig.js';

const CONFIG_DIR = path.dirname(PROJECTS_FILE_PATH);
const APP_CONFIG_PATH = path.join(CONFIG_DIR, 'app.json');

export function loadAppConfig() {
  const defaults = {
    serverPort: 3300
  };
  let userConfig = {};
  try {
    if (fs.existsSync(APP_CONFIG_PATH)) {
      userConfig = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('[DevAssistant] 加载 app.json 配置失败，使用默认值:', e.message);
  }
  return { ...defaults, ...userConfig };
}

let cachedActiveAppConfig = null;

// 💡 导出清空配置缓存的接口，在切换项目或修改配置时主动调用
export function clearAppConfigCache() {
  cachedActiveAppConfig = null;
}

/**
 * 动态获取当前激活项目的合并配置（全局 app.json + 项目 .omnidev.json）
 */
export function getActiveAppConfig() {
  if (cachedActiveAppConfig) {
    return cachedActiveAppConfig;
  }
  const baseConfig = loadAppConfig();
  try {
    const activeProj = getActiveProject();
    if (activeProj && activeProj.path) {
      const localConfigPath = path.join(activeProj.path, '.omnidev.json');
      if (fs.existsSync(localConfigPath)) {
        const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
        cachedActiveAppConfig = { ...baseConfig, ...localConfig };
        return cachedActiveAppConfig;
      }
    }
  } catch (e) {
    console.error('[DevAssistant] 读取项目私有 .omnidev.json 失败:', e.message);
  }
  cachedActiveAppConfig = baseConfig;
  return cachedActiveAppConfig;
}

/**
 * 使用 ES6 Proxy 代理全局 appConfig，实现完全无损、非侵入性的热插拔项目级自描述配置重载
 */
export const appConfig = new Proxy({}, {
  get(target, prop) {
    return getActiveAppConfig()[prop];
  },
  ownKeys(target) {
    return Reflect.ownKeys(getActiveAppConfig());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getActiveAppConfig(), prop);
  }
});

// 物理获取注册项目清单及状态
export function getProjectsData(sshHost = '') {
  if (!fs.existsSync(PROJECTS_FILE_PATH)) {
    throw new Error('全局项目定义文件 projects.json 未找到');
  }
  const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
  const enrichedProjects = data.projects.map(proj => {
    return { ...proj, sshHost: sshHost || '' };
  });
  return {
    activeProjectId: data.activeProjectId,
    projects: enrichedProjects
  };
}

// 登记新项目
export function addProject(name, rawPath) {
  if (!fs.existsSync(PROJECTS_FILE_PATH)) {
    throw new Error('全局项目定义文件 projects.json 未找到');
  }
  const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
  
  const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (!cleanId || data.projects.some(p => p.id === cleanId)) {
    throw new Error('项目ID生成冲突或名称已存在，请换一个名称');
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
  data.activeProjectId = cleanId;
  
  fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  return { activeProjectId: cleanId, warning };
}

// 编辑项目
export function editProject(id, name, rawPath) {
  if (!fs.existsSync(PROJECTS_FILE_PATH)) {
    throw new Error('全局项目定义文件 projects.json 未找到');
  }
  const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
  const project = data.projects.find(p => p.id === id);
  if (!project) {
    throw new Error(`未找到 ID 为 [${id}] 的项目配置`);
  }

  const cleanPath = path.normalize(rawPath.trim());
  let warning = null;
  if (!fs.existsSync(cleanPath)) {
    warning = `本地项目路径不存在 [${cleanPath}]，您可能需要稍后将项目拉取到该地址`;
  }

  project.name = name.trim();
  project.path = cleanPath;

  fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  return { project, warning };
}

// 删除项目
export function deleteProject(projectId) {
  if (!fs.existsSync(PROJECTS_FILE_PATH)) {
    throw new Error('全局项目定义文件 projects.json 未找到');
  }
  const data = JSON.parse(fs.readFileSync(PROJECTS_FILE_PATH, 'utf-8'));
  const projectIndex = data.projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) {
    throw new Error(`未找到 ID 为 [${projectId}] 的项目配置`);
  }

  const deletedProject = data.projects[projectIndex];
  data.projects.splice(projectIndex, 1);

  if (data.activeProjectId === projectId) {
    if (data.projects.length > 0) {
      data.activeProjectId = data.projects[0].id;
    } else {
      data.activeProjectId = '';
    }
  }

  fs.writeFileSync(PROJECTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  return { deletedProject, activeProjectId: data.activeProjectId };
}
