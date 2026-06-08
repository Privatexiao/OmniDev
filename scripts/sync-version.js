import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const versionPath = path.join(rootDir, 'version.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function requireVersionInfo() {
  if (!fs.existsSync(versionPath)) {
    throw new Error('缺少 version.json，无法同步版本号');
  }

  const info = readJson(versionPath);
  const version = String(info.version || '').trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`version.json.version 非法: ${version || '<empty>'}`);
  }

  return {
    version,
    changelog: String(info.changelog || '').trim(),
    downloadUrlTemplate: String(info.downloadUrlTemplate || '').trim()
  };
}

function renderTemplate(template, version) {
  return template.replaceAll('{{version}}', version);
}

function syncPackage(version) {
  const filePath = path.join(rootDir, 'package.json');
  const pkg = readJson(filePath);
  pkg.version = version;
  writeJson(filePath, pkg);
}

function syncPackageLock(version) {
  const filePath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(filePath)) return;

  const lock = readJson(filePath);
  lock.version = version;
  if (lock.packages?.['']) {
    lock.packages[''].version = version;
  }
  writeJson(filePath, lock);
}

function syncTauriConfig(version) {
  const filePath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const config = readJson(filePath);
  config.version = '../version.json';
  writeJson(filePath, config);
}

function syncCargoToml(version) {
  const filePath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  const content = fs.readFileSync(filePath, 'utf-8');
  const packageVersionPattern = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/;

  if (!packageVersionPattern.test(content)) {
    throw new Error('未能在 src-tauri/Cargo.toml 中定位 [package].version');
  }

  const next = content.replace(
    packageVersionPattern,
    (_match, before, after) => `${before}${version}${after}`
  );
  fs.writeFileSync(filePath, next, 'utf-8');
}

function syncUpdateJson(info) {
  const filePath = path.join(rootDir, 'update.json');
  const update = fs.existsSync(filePath) ? readJson(filePath) : {};

  update.version = info.version;
  if (info.changelog) {
    update.changelog = info.changelog;
  }
  if (info.downloadUrlTemplate) {
    update.downloadUrl = renderTemplate(info.downloadUrlTemplate, info.version);
  }

  writeJson(filePath, update);
}

function main() {
  const info = requireVersionInfo();
  syncPackage(info.version);
  syncPackageLock(info.version);
  syncTauriConfig(info.version);
  syncCargoToml(info.version);
  syncUpdateJson(info);
  console.log(`[version:sync] 已同步版本号 ${info.version}`);
}

main();
