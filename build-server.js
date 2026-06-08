import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist-server');
const versionInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf-8'));

console.log('========================================');
console.log('🔧 正在启动 Node.js 后端独立依赖构建...');
console.log('========================================');

// 1. 清理并创建全新的 dist-server 目录
if (fs.existsSync(distDir)) {
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('⚠️ 清理旧 dist-server 目录失败，尝试重命名:', e.message);
  }
}
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 2. 复制 server.js 和 server 核心业务文件夹
fs.copyFileSync(path.join(rootDir, 'server.js'), path.join(distDir, 'server.js'));

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    const stat = fs.lstatSync(fromPath);
    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else if (stat.isFile()) {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

copyFolderSync(path.join(rootDir, 'server'), path.join(distDir, 'server'));

// 复制统一版本源，保证打包后的后端更新检查读取同一版本号。
fs.copyFileSync(path.join(rootDir, 'version.json'), path.join(distDir, 'version.json'));

// 💡 复制辅助自动化脚本 scripts 文件夹（包含 auto_login.py 等），保证打包后 Python 助手功能正常
if (fs.existsSync(path.join(rootDir, 'scripts'))) {
  copyFolderSync(path.join(rootDir, 'scripts'), path.join(distDir, 'scripts'));
}

// 3. 复制 config 模板作为初始配置。生产包必须使用模板，避免把本机私有配置和 vault 打进安装包。
const configSrc = path.join(rootDir, 'config.example');
if (!fs.existsSync(configSrc)) {
  console.error('❌ 缺少 config.example 目录，无法生成生产初始配置。');
  process.exit(1);
}
copyFolderSync(configSrc, path.join(distDir, 'config'));

// 4. 创建专用的生产依赖 package.json，彻底剥离 Vite 和 Tauri 命令行开发依赖
const pkg = {
  name: "omnidev-server",
  version: versionInfo.version,
  private: true,
  type: "module",
  dependencies: {
    "cors": "^2.8.6",
    "express": "^5.2.1",
    "ssh2": "^1.17.0"
  }
};
fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

// 5. 自动下载生产依赖（自动拉取传递性依赖，如 express 的 body-parser、statuses 等）
try {
  console.log('📦 正在运行 npm install --omit=dev...');
  execSync('npm install --omit=dev', { cwd: distDir, stdio: 'inherit' });
  console.log('🎉 Node.js 生产依赖及二级依赖构建完毕！');
} catch (e) {
  console.error('❌ 安装依赖失败:', e.message);
  process.exit(1);
}

console.log('========================================');
console.log('✅ 后端生产打包目录构建成功: ./dist-server');
console.log('========================================');
