import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf-8'));
}

const sourceVersion = readJson('version.json').version;
const lock = readJson('package-lock.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
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
  'update.json': readJson('update.json').version,
  'src-tauri/tauri.conf.json': tauriVersion,
  'src-tauri/Cargo.toml': cargoVersion
};

const mismatches = Object.entries(versions).filter(([, version]) => version !== sourceVersion);
console.log(JSON.stringify(versions, null, 2));

if (mismatches.length > 0) {
  console.error('[version:check] 版本号不一致:');
  for (const [file, version] of mismatches) {
    console.error(`- ${file}: ${version || '<empty>'}`);
  }
  process.exit(1);
}

console.log(`[version:check] 所有版本号一致: ${sourceVersion}`);
