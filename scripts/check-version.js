import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf-8'));
}

const sourceInfo = readJson('version.json');
const sourceVersion = sourceInfo.version;
const lock = readJson('package-lock.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const updateInfo = readJson('update.json');
const cargoContent = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf-8');
const cargoVersion = cargoContent.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
const tauriVersion = tauriConfig.version === '../version.json'
  ? sourceVersion
  : tauriConfig.version;

const versions = {
  'version.json': sourceVersion,
  'package.json': readJson('package.json').version,
  'package-lock.json': lock.version,
  'package-lock.json packages root': lock.packages?.['']?.version,
  'update.json': updateInfo.version,
  'src-tauri/tauri.conf.json': tauriVersion,
  'src-tauri/Cargo.toml': cargoVersion
};

const mismatches = Object.entries(versions).filter(([, version]) => version !== sourceVersion);
const expectedUpdateMode = sourceInfo.updateMode === 'manual' ? 'manual' : 'automatic';
const expectedDownloadUrl = String(sourceInfo.downloadUrlTemplate || '').replaceAll('{{version}}', sourceVersion);
const platformUpdate = updateInfo.platforms?.['windows-x86_64'];
const metadataMismatches = [
  ['update.json.updateMode', updateInfo.updateMode, expectedUpdateMode],
  ['update.json.notes', updateInfo.notes, sourceInfo.changelog],
  ['update.json.downloadUrl', updateInfo.downloadUrl, expectedDownloadUrl],
  ['update.json.platforms.windows-x86_64.url', platformUpdate?.url, expectedDownloadUrl],
  ['update.json.platforms.windows-x86_64.signature', platformUpdate?.signature, sourceInfo.updaterSignature]
].filter(([, actual, expected]) => actual !== expected);
console.log(JSON.stringify(versions, null, 2));

if (mismatches.length > 0 || metadataMismatches.length > 0) {
  console.error('[version:check] 发布元数据不一致:');
  for (const [file, version] of mismatches) {
    console.error(`- ${file}: ${version || '<empty>'}`);
  }
  for (const [field, actual, expected] of metadataMismatches) {
    console.error(`- ${field}: ${actual || '<empty>'}，期望 ${expected || '<empty>'}`);
  }
  process.exit(1);
}

const updaterPubkey = String(tauriConfig.plugins?.updater?.pubkey || '').trim();
if (!updaterPubkey || updaterPubkey === 'REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY') {
  console.warn('[version:check] 警告：尚未配置 Tauri updater 公钥，正式发布前必须替换占位值。');
}
if (!String(sourceInfo.updaterSignature || '').trim()) {
  console.warn('[version:check] 警告：尚未填写安装包签名，当前 update.json 不能用于正式更新。');
}

console.log(`[version:check] 所有版本号一致: ${sourceVersion}`);
