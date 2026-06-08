/**
 * @file envService.js
 * @description 多环境配置服务。提供公共环境配置项的 CRUD、凭证加密保险库存取、环境变量注入映射。
 *              不再区分主/子项目——每个登记项目使用一组扁平环境，凭证直接挂载在环境内。
 */
import fs from 'fs';
import path from 'path';
import { getCommonEnvsFilePath, getActiveProject } from '../config/pathConfig.js';
import { appConfig } from './projectService.js';
import { securityService } from './securityService.js';

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

/**
 * 返回当前激活项目的保险库命名空间前缀
 * 格式：${projectId}#${envName}
 */
function secretScope(envName) {
  const proj = getActiveProject();
  const pid = (proj && proj.id) ? proj.id : 'default';
  return `${pid}#${envName}`;
}

// ==================== 环境公共配置 ====================

export function getCommonEnvsConfig() {
  return readJsonFile(getCommonEnvsFilePath(), { envs: {} });
}

export function saveCommonEnvConfig(envKey, config) {
  const scope = secretScope(envKey);

  // 1. 将敏感密码存入系统级加密保险库
  if (config.online_password && config.online_password !== '******') {
    securityService.saveSecret(scope, 'online_password', config.online_password);
  }

  // 2. 将凭证字段值写入保险库，物理文件中仅保留脱敏结构 (value 清空)
  const credentials = normalizeCredentialFields(config.credentials);
  credentials.forEach(field => {
    if (field.value) {
      securityService.saveSecret(scope, field.key, field.value);
    }
  });
  const strippedCredentials = credentials.map(f => ({ key: f.key, value: '', inject_type: f.inject_type }));

  const data = getCommonEnvsConfig();
  if (!data.envs) data.envs = {};
  data.envs[envKey] = {
    VUE_DEV_HOST: config.VUE_DEV_HOST || '',
    company_name: config.company_name || '',
    remote_dir: config.remote_dir || '',
    local_port: config.local_port ? parseInt(config.local_port, 10) : null,
    login_url: config.login_url || '',
    online_username: config.online_username || '',
    online_password: '', // 物理文件中彻底脱敏
    login_browser: config.login_browser || 'chrome',
    node_version: config.node_version || '',
    start_cmd: config.start_cmd || '',
    credentials: strippedCredentials,
    ...(config.disable_branch ? { disable_branch: true } : {}),
    ...(config.disable_start ? { disable_start: true } : {})
  };
  writeJsonFile(getCommonEnvsFilePath(), data);
}

export function deleteCommonEnvConfig(envKey) {
  const scope = secretScope(envKey);

  // 清理该环境在保险库中所有字段密钥 + 密码
  try {
    const data = getCommonEnvsConfig();
    const envConf = (data.envs || {})[envKey] || {};
    const fields = normalizeCredentialFields(envConf.credentials);
    fields.forEach(f => securityService.deleteSecret(scope, f.key));
    securityService.deleteSecret(scope, 'online_password');
  } catch (e) { /* 静默 */ }

  const data = getCommonEnvsConfig();
  if (data.envs && data.envs[envKey]) {
    delete data.envs[envKey];
    writeJsonFile(getCommonEnvsFilePath(), data);
  }
}

/**
 * 获取所有环境的合并配置（凭证 value 从保险库实时解密回填）
 */
export function getCommonEnvs() {
  const envs = getCommonEnvsConfig().envs || {};
  const decrypted = {};
  for (const [key, envConf] of Object.entries(envs)) {
    const scope = secretScope(key);

    // 密码回填
    const pwd = securityService.getSecret(scope, 'online_password');

    // 凭证字段回填
    const rawCreds = normalizeCredentialFields(envConf.credentials || []);
    const hydratedCreds = rawCreds.map(f => ({
      ...f,
      value: securityService.getSecret(scope, f.key) || f.value || ''
    }));

    decrypted[key] = {
      ...envConf,
      online_password: pwd || envConf.online_password || '',
      credentials: hydratedCreds
    };
  }
  return decrypted;
}

/**
 * 获取单个环境的完整合并配置（含保险库解密的凭证）
 */
export function getEnvConfig(envName) {
  const all = getCommonEnvs();
  return all[envName] || null;
}

// ==================== 凭证字段工具 ====================

export function normalizeCredentialFields(raw) {
  if (Array.isArray(raw)) {
    return raw
      .filter(item => item && item.key)
      .map(item => ({
        key: String(item.key || '').trim(),
        value: item.value || '',
        inject_type: item.inject_type || 'cookie'
      }));
  }
  return Object.entries(raw || {}).map(([key, val]) => {
    if (val && typeof val === 'object' && 'key' in val) {
      return {
        key: String(val.key || '').trim(),
        value: val.value || '',
        inject_type: val.inject_type || 'cookie'
      };
    }
    return {
      key: String(key || '').trim(),
      value: val || '',
      inject_type: 'cookie'
    };
  }).filter(item => item && item.key);
}

export function getCredentialValue(raw, key) {
  const field = normalizeCredentialFields(raw).find(item => item.key === key);
  return field ? field.value : '';
}
