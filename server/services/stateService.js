/**
 * @file stateService.js
 * @description 运行状态管理服务。管理当前项目运行时的本地端口分配与活跃环境，并支持项目独立 state.json 文件的读取与持久化。
 */
import fs from 'fs';
import { getStateFilePath } from '../config/pathConfig.js';
import { appConfig } from './projectService.js';

export let state = {
  currentEnv: '',
  envPorts: {}
};

// 从本地项目独立持久化状态文件中加载运行环境与端口分配
export function loadState() {
  try {
    state.currentEnv = '';
    state.envPorts = {};
    const stateFile = getStateFilePath();
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      if (data) {
        if (data.currentEnv) state.currentEnv = data.currentEnv;
        if (data.envPorts) state.envPorts = data.envPorts;
      }
    }
  } catch (e) {
    console.error('[DevAssistant] 读取 state.json 失败:', e.message);
  }
}

// 保存运行环境状态与端口映射
export function saveState() {
  try {
    const stateFile = getStateFilePath();
    fs.writeFileSync(stateFile, JSON.stringify({
      currentEnv: state.currentEnv,
      envPorts: state.envPorts
    }, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DevAssistant] 写入 state.json 失败:', e.message);
  }
}
