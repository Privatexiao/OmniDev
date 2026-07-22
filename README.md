# 🚀 OmniDev 开发环境控制台

> 一个**纯本地运行**的多环境开发控制台（"开发大盘"）。把日常前端开发里散落的操作——项目登记、多环境启停、凭证注入、免密登录、远程分支切换、日志查看——收敛进一个图形界面。

基于 **Vue 3 + Vite** 前端、**Express (Node.js)** 后端、**ssh2** 远程通道构建，可选用 **Tauri** 打包为桌面应用。

> 📖 想了解架构设计与核心逻辑细节，见 [技术文档.md](技术文档.md)。

---

## ✨ 核心能力

- **多项目隔离**：登记多个本地项目，一键切换激活；每个项目的环境/端口/凭证配置物理隔离，互不污染。
- **多环境一键启停**：自动分配空闲端口（8080+）、按环境配置强制使用 Node 版本（未配置时才自动探测）、自动匹配启动脚本，跨 Windows / macOS / Linux 拉起本地开发服务；指定版本不可用时直接停止，不会降级到系统 Node。
- **凭证安全注入**：登录凭证经 AES 加密存入本地保险库；启动时以**进程级环境变量**注入（绝不写入业务项目任何文件），或前端注入 Cookie / localStorage / sessionStorage 后直达登录。
- **浏览器免密登录**：调起 Python + Playwright 自动识别表单并填密登录，依赖缺失自动自愈安装。
- **远程 SSH 辅助**：长连接池复用，远程 Git 分支查询/强力干净切换、远程命令下发，本地/远程日志分流落盘。

## 环境要求

- Node.js：建议 LTS 版本，需自带 npm。
- PowerShell：Windows 默认使用 PowerShell 运行初始化脚本。
- Python：仅浏览器自动登录功能需要；未安装时可跳过初始化安装，后续功能触发时再处理。
- Tauri 桌面打包：需额外安装 Rust 与 Tauri 2 相关系统依赖。

---

## 📦 快速开始 (Quick Start)

新开发者拉取项目后，**一条命令一键开箱**：

```powershell
# 1. 克隆项目
git clone <repo-url> omnidev
cd omnidev

# 2. 一键初始化（复制配置 + npm install + 可选自动登录依赖，结尾询问是否启动）
.\setup.ps1
```

`setup.ps1` 会自动完成：复制配置模板 → 检测 Node 并执行 `npm install` → 询问是否安装自动登录依赖 → 询问是否立即 `npm run dev` 启动。

自动登录依赖安装是可选步骤；使用 `-Yes` 时交互确认默认按 Yes 处理，使用 `-SkipAutoLogin` 可跳过。

###   进阶参数

```powershell
.\setup.ps1 -Yes -Run      # 全自动：装好一切并直接启动
.\setup.ps1 -SkipInstall   # 跳过 npm install
.\setup.ps1 -SkipAutoLogin # 跳过 Python/Playwright 自动登录依赖
```

> [!NOTE]
> - `setup.ps1` 会把 `config.example/` 复制为您本机私有的 `config/`，该目录已被 `.gitignore` 排除，本地路径与 SSH 密钥绝不会提交。
> - 首次运行 `.ps1` 若被执行策略拦截，先执行：`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`。
> - 不想用一键脚本，也可手动 `npm install` 后 `npm run dev`。

---

## 🧭 运行方式

### 开发模式

```powershell
npm run dev
```

该命令会拉起 Node 后端服务，并启动 Vite 前端。前端端口读取 `config/app.json.frontendPort`，后端端口读取 `config/app.json.serverPort`。

### 桌面开发模式

```powershell
npm run tauri:dev
```

Tauri 配置中的 `beforeDevCommand` 会执行 `npm run dev`，用于加载本地 Vite 页面。

### 桌面生产打包

```powershell
npx tauri build
```

Tauri 版本号直接从仓库根目录 `version.json` 读取。打包前会执行 `npm run build`；其中 `prebuild` 会自动同步版本号，`build-server.js` 会生成 `dist-server/`，复制后端代码、`scripts/`、`config.example/`、`version.json`，并在 `dist-server/` 内安装生产依赖。

---

## ⚠️ config/ 与 config.example/ 的区别（重要）

最容易搞混的一点：**`config/` 和 `config.example/` 不是同一个东西，它们的角色完全不同。**

**你平时改的，是 `config/`。**
这是你专属的私有目录。`setup.ps1` 在首次运行时把它从 `config.example/` 复制生成，之后就跟模板再无关系。你可以随意在里面修改端口、填真实 SSH 密码、配项目路径——所有这些改动都只在你本机生效，`.gitignore` 确保它永远不会被提交到仓库。

**不能动的，是 `config.example/`。**
这是团队统一的配置模板。它里面只有空键名和占位符，不包含任何人的真实密码或路径。它的作用就是定义 "每个人需要填哪些字段、每个字段是什么意思"——新人 clone 后靠它初始化自己的 `config/`，已初始化的人在登记新项目时靠它拷贝默认模板。所以它必须提交到 Git，但个人**绝不能**直接修改它，除非你是项目维护者，要给全团队统一增删某个配置项。

### `config.example/` 不止 init 用一次

很多人以为 `./setup.ps1` 跑完，`config.example/` 就完成使命了。实际上它在**运行时仍被持续读取**：

- **登记新项目**时，该项目独立的 `envs_common.json` 从 `config.example/` 拷贝初始化（见 [pathConfig.js](server/config/pathConfig.js)）。
- **Vite 启动**时，如果 `config/app.json` 尚未生成，会回落读取 `config.example/app.json` 拿前后端端口（见 [vite.config.js](vite.config.js)）。
- `config.example/omnidev.schema.json` 是 `.omnidev.json`（项目级自描述配置）的**字段定义文件**，新增配置项时以此为准。

> **一句话**：你在控制台里改的所有设置，最终落盘到 `config/`。**永远不要动 `config.example/`，除非你要为团队"重新设计这个模板"。**

---

## ⚙️ 配置说明

所有个人定制化配置均存放在 `config/` 目录中（由 `config.example/` 初始化生成）：

- **`config/app.json`** — 端口、大盘标题、关闭偏好、更新源、自动检查更新等全局设置
- **`config/projects.json`** — 已登记项目清单及当前激活项 `activeProjectId`（含本机**真实物理绝对路径**）
- **`config/projects/<id>/ssh.json`** — 该项目专属的远程 SSH 连接信息（**按项目隔离**）
- **`config/vault.json`** — AES 加密后的凭证密文保险库（密码 / Cookie / Token 的密文，自动生成）
- **`config/projects/<id>/`** — **每个项目一套独立配置**（物理隔离）：`state.json`（端口/活跃环境）、`envs_common.json`（公共环境，凭证字段内联脱敏存储）

此外，AES 主密钥独立存放于用户家目录 `~/.omnidev_secret`（`mode 0o600`），与项目配置物理分离。

### 项目级自描述配置（可选）

在任意业务项目根目录放一份 `.omnidev.json`，即可覆盖 `app.json` 描述该项目特有的预设。切到该项目即自动热加载生效。字段定义见 [config.example/omnidev.schema.json](config.example/omnidev.schema.json)。

---

## 🚢 发布与更新

版本号采用单一入口：只手动修改仓库根目录 [version.json](version.json)。

```json
{
  "version": "0.1.3",
  "updateMode": "automatic",
  "changelog": "优化了一下问题",
  "downloadUrlTemplate": "https://github.com/Privatexiao/OmniDev/releases/download/v{{version}}/OmniDev_{{version}}_x64-setup.exe",
  "updaterSignature": "打包后生成的 .sig 文件内容"
}
```

- `updateMode: "automatic"`：小版本默认策略，用户点击更新后直接在应用内下载、签名校验、静默安装并重启，不再弹出重大版本确认。
- `updateMode: "manual"`：大版本或高风险变更，先弹窗确认，再执行同一套签名更新流程。
- 更新策略由发布者显式指定，不根据语义化版本号自动推断，避免特殊发布被错误处理。

> 当前前端和 Node 资源仍随 Tauri 安装包发布，因此 `automatic` 表示“应用内静默覆盖安装并重启”，不等同于无需重启的前端资源热替换。若后续需要真正热更新，必须先将可更新资源外置，并增加版本回滚和完整性校验机制。

`0.1.4` 是首个启用 Tauri 签名更新的版本。更早版本没有 updater 公钥和签名校验能力，需要手动安装一次 `0.1.4` 或更高版本完成迁移；之后才能使用应用内签名更新。

`version.json` 会驱动以下位置：

- `package.json.version`
- `package-lock.json` 根版本
- `src-tauri/tauri.conf.json.version`（直接指向 `../version.json`，支持 `npx tauri build`）
- `src-tauri/Cargo.toml` 的 `package.version`
- `update.json` 的版本、更新策略、日志、下载地址和 Tauri 平台签名
- 后端更新检查接口的当前版本

常用命令：

```powershell
npm run version:sync   # 手动同步所有派生版本文件
npm run version:check  # 校验所有版本号是否一致
npm run tauri:build    # Tauri 打包；会读取 version.json，并在 beforeBuildCommand 中执行 npm run build
```

### 首次启用签名更新

以下步骤只执行一次：

1. 在仓库外生成并永久备份 updater 密钥。当前项目约定放在同级的 `OmniDev-key/` 目录：

   ```powershell
   npx tauri signer generate -w "..\OmniDev-key\omnidev-updater.key"
   ```

2. 将生成的公钥完整内容替换到 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。这里填写公钥内容，不是公钥文件路径。
3. 私钥及密码不得提交到仓库。项目 `.gitignore` 已过滤常见密钥、证书、`.env` 和 `.sig` 文件作为第二道保护，但私钥仍必须存放在仓库外。私钥丢失后，已安装客户端将无法验证后续更新；如需轮换密钥，应先用旧密钥发布一个内置新公钥的过渡版本。

### 一键发布

发布脚本会自动读取项目同级 `OmniDev-key/omnidev-updater.key`，当前本机无需再设置私钥环境变量，只需执行：

```powershell
npm run release
```

脚本会依次询问目标版本号和中文更新说明，然后自动修改并同步版本、判断更新模式、签名打包、查找 NSIS `.exe.sig`、回填签名和执行最终校验。主版本号变化默认使用 `manual`，其余版本默认使用 `automatic`；高风险版本可显式覆盖：

```powershell
npm run release -- --manual
npm run release -- --automatic
```

执行前可安全预览，不修改文件也不打包：

```powershell
npm run release -- --dry-run
```

交互模式可避免 Windows npm 转发中文参数时出现编码问题；CI 等非交互环境可直接执行 `node scripts/release.js <版本号> <更新说明> [选项]`。

如果私钥存放在其他位置，可设置 `TAURI_SIGNING_PRIVATE_KEY_PATH`。本机默认密钥使用空密码，脚本会显式传入空密码以避免 Tauri 弹出交互提示；如果生成密钥时设置了非空密码，则需在运行发布命令前设置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

命令成功后，终端会列出安装包和 `.sig` 的准确路径。只需先将这两个文件上传到对应 GitHub Release，确认安装包 URL 可访问，再最后发布 `update.json`。签名已由脚本自动回填，不要再次打包。

更新检查默认先访问 `config/app.json.updateUrl`，GitHub raw 地址连接失败时会重试并自动尝试 jsDelivr 与 GitHub API。检查成功后，主源和可直接返回清单的备用源会一并交给 Tauri updater；任一来源下载到的安装包都必须通过同一公钥签名校验。所有更新源均失败时，设置页会明确显示“更新检查失败”并保留真实当前版本，不再将网络错误伪装成“已是最新版”。

发布前仍需确认不会把 `config/`、`vault.json`、真实 SSH 信息和本机路径打入生产包，并确认 `dist-server/config` 来源为 `config.example/`。最后使用上一个正式版本完成一次真实升级验证。故障版本不要覆盖同版本安装包，应发布更高版本修复。

---

## 🛡️ 安全设计与边界

1. **物理闭环隔离**：后端服务仅向本机 `127.0.0.1` 环回口提供，封死外网/局域网扫描与未授权访问。
2. **路径穿越根治**：环境标识在文件读写前经正则强清洗（仅允许 `a-z0-9_-`），物理杜绝 `../` 越权读写任意配置文件。
3. **并发竞态防刷**：SSH 测试/连接/断开等异步操作配 UI 禁用锁 + 后端死链清理 + 退出竞态标志位，防高频点击引发长连接死锁。
4. **凭证脱敏与 XSS 免疫**：敏感凭证 AES 加密落库、物理文件脱敏、接口返回二次脱敏；终端日志回显全程 Vue 安全插值，100% 禁用 `v-html`。

## ⚡ 性能与健壮性设计

1. **内存缓存与 I/O 避障**：在日志服务中引入内存级日志目录检查缓存，避免高频日志写入引发高负载同步 I/O 检测；将历史日志清理（`cleanOldLogs`）重构为异步 `fs.promises` 并行执行，防止扫描及删除大批文件时卡死 Node.js 事件循环。
2. **多环境日志 Map 物理隔离**：升级前缀合并状态判定，由单全局变量改为基于 Map 按文件路径物理隔离记录，彻底治愈多项目/多环境交错输出日志时合并标题覆盖失效的问题。
3. **前置管道匹配过滤**：Windows 平台 PID 反查通过对 `netstat -ano` 执行 `findstr` 前置端口过滤，避免拉取及逐行分割解析全网数万行网络连接数据，降低 CPU 及内存峰值。
4. **签名更新与重复触发锁**：安装包由 Tauri updater 下载并校验签名，前端展示真实下载进度并锁定更新操作，避免连续点击重复启动安装。

注意事项：

- 本项目面向本地开发环境，不应暴露到公网或局域网。
- 后端接口默认用于本机控制台调用；如调整监听地址、代理或 CORS，需要重新评估访问控制。
- Tauri 当前 CSP 配置为 `null`，如引入远程页面或第三方脚本，需要补充 CSP。
- 更新客户端读取 `update.json.platforms.windows-x86_64` 中的下载地址和签名，只安装通过 `tauri.conf.json` 公钥校验的更新包；旧的顶层 `downloadUrl` 仅用于兼容尚未升级到签名更新器的历史版本。
- AES 主密钥存放在用户目录，能保护配置文件泄漏场景，但不能抵御本机账户已被完全控制的场景。

---

## 🗂️ 项目结构

```
OmniDev/
├── src/                    # Vue 3 前端
│   ├── views/console/      # 控制台主界面与各功能组件
│   └── utils/              # 跨平台适配、登录注入适配器
├── server.js               # Express 后端入口（路由挂载 + 优雅退出）
├── server/
│   ├── routes/             # 模块化路由（project/env/start/ssh/terminal/config）
│   ├── services/           # 服务层（process/ssh/security/log/env/project/state）
│   └── config/             # 隔离路径解析 + 冷启动数据迁移
├── scripts/auto_login.py   # Python + Playwright 自动登录脚本
├── src-tauri/              # Tauri 2 桌面外壳（Rust，可选）
├── config.example/         # 配置模板（提交，供初始化）
├── version.json            # 唯一人工维护的版本与更新信息入口
└── setup.ps1               # 一键初始化脚本
```

---

## 🤝 团队协作与 Git 提交规范

为避免个人路径和敏感密码污染代码库，请遵守以下规范：

**✅ 应提交（团队共享）**
- `src/`、`server.js`、`server/`（前后端核心代码）
- `src-tauri/`、`scripts/`（桌面外壳与自动登录脚本）
- `config.example/`（配置模板，**必须提交**，供新开发参考）
- `setup.ps1`、`package.json`、`package-lock.json`、`vite.config.js`、`version.json`、`update.json`、`.gitignore`、`README.md`、`技术文档.md`

**❌ 禁止提交（个人私有）**
- ❌ `config/`（SSH 密码、本地绝对路径、凭证密文等）
- ❌ `~/.omnidev_secret`（AES 主密钥，本就在家目录之外）
- ❌ `logs/`、`node_modules/`、`dist/`、`src-tauri/target/`

---

## 💡 常见微调

1. **端口冲突**：`3000` / `3300` 被占用时，编辑 `config/app.json` 的 `frontendPort` / `serverPort` 即可，Vite 代理与后端会自动读取适配，无需改任何代码。
2. **新增项目**：在控制台"登记新项目"填写目标工作目录，再创建环境并配置凭证字段与注入规则；需要另一套凭证体系直接登记为独立新项目。
3. **自动登录依赖**：未在初始化时安装也没关系——首次点击"自动登录"时，Python 脚本会静默自愈安装 Playwright 与 Chromium 内核。
