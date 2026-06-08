# 🚀 OmniDev 开发环境控制台

> 一个**纯本地运行**的多环境开发控制台（"开发大盘"）。把日常前端开发里散落的操作——项目登记、多环境启停、凭证注入、免密登录、远程分支切换、日志查看——收敛进一个图形界面。

基于 **Vue 3 + Vite** 前端、**Express (Node.js)** 后端、**ssh2** 远程通道构建，可选用 **Tauri** 打包为桌面应用。

> 📖 想了解架构设计与核心逻辑细节，见 [技术文档.md](技术文档.md)。

---

## ✨ 核心能力

- **多项目隔离**：登记多个本地项目，一键切换激活；每个项目的环境/端口/凭证配置物理隔离，互不污染。
- **多环境一键启停**：自动分配空闲端口（8080+）、自动探测并切换 Node 版本（`fnm`）、自动匹配启动脚本，跨 Windows / macOS / Linux 拉起本地开发服务。
- **凭证安全注入**：登录凭证经 AES 加密存入本地保险库；启动时以**进程级环境变量**注入（绝不写入业务项目任何文件），或前端注入 Cookie / localStorage / sessionStorage 后直达登录。
- **浏览器免密登录**：调起 Python + Playwright 自动识别表单并填密登录，依赖缺失自动自愈安装。
- **远程 SSH 辅助**：长连接池复用，远程 Git 分支查询/强力干净切换、远程命令下发，本地/远程日志分流落盘。

---

## 📦 快速开始 (Quick Start)

新开发者拉取项目后，**一条命令一键开箱**：

```powershell
# 1. 克隆项目
git clone <repo-url> omnidev
cd omnidev

# 2. 一键初始化（复制配置 + npm install + 自动登录依赖，结尾询问是否启动）
.\setup.ps1
```

`setup.ps1` 会自动完成：复制配置模板 → 检测 Node 并 `npm install` → 安装自动登录依赖 → 询问是否立即 `npm run dev` 启动。

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

- **`config/app.json`** — 端口、大盘标题、项目级 `preset` 凭证注入预设与环境变量映射规则、脚本映射
- **`config/projects.json`** — 已登记项目清单及当前激活项 `activeProjectId`（含本机**真实物理绝对路径**）
- **`config/projects/<id>/ssh.json`** — 该项目专属的远程 SSH 连接信息（**按项目隔离**）
- **`config/vault.json`** — AES 加密后的凭证密文保险库（密码 / Cookie / Token 的密文，自动生成）
- **`config/projects/<id>/`** — **每个项目一套独立配置**（物理隔离）：`state.json`（端口/活跃环境）、`envs_common.json`（公共环境，凭证字段内联脱敏存储）

此外，AES 主密钥独立存放于用户家目录 `~/.omnidev_secret`（`mode 0o600`），与项目配置物理分离。

### 项目级自描述配置（可选）

在任意业务项目根目录放一份 `.omnidev.json`，即可覆盖 `app.json` 描述该项目特有的预设。切到该项目即自动热加载生效。字段定义见 [config.example/omnidev.schema.json](config.example/omnidev.schema.json)。

---

## 🛡️ 四大安全防线

1. **物理闭环隔离**：后端服务仅向本机 `127.0.0.1` 环回口提供，封死外网/局域网扫描与未授权访问。
2. **路径穿越根治**：环境标识在文件读写前经正则强清洗（仅允许 `a-z0-9_-`），物理杜绝 `../` 越权读写任意配置文件。
3. **并发竞态防刷**：SSH 测试/连接/断开等异步操作配 UI 禁用锁 + 后端死链清理 + 退出竞态标志位，防高频点击引发长连接死锁。
4. **凭证脱敏与 XSS 免疫**：敏感凭证 AES 加密落库、物理文件脱敏、接口返回二次脱敏；终端日志回显全程 Vue 安全插值，100% 禁用 `v-html`。

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
└── setup.ps1               # 一键初始化脚本
```

---

## 🤝 团队协作与 Git 提交规范

为避免个人路径和敏感密码污染代码库，请遵守以下规范：

**✅ 应提交（团队共享）**
- `src/`、`server.js`、`server/`（前后端核心代码）
- `src-tauri/`、`scripts/`（桌面外壳与自动登录脚本）
- `config.example/`（配置模板，**必须提交**，供新开发参考）
- `setup.ps1`、`package.json`、`package-lock.json`、`vite.config.js`、`.gitignore`、`README.md`、`技术文档.md`

**❌ 禁止提交（个人私有）**
- ❌ `config/`（SSH 密码、本地绝对路径、凭证密文等）
- ❌ `~/.omnidev_secret`（AES 主密钥，本就在家目录之外）
- ❌ `logs/`、`node_modules/`、`dist/`、`src-tauri/target/`

---

## 💡 常见微调

1. **端口冲突**：`3000` / `3300` 被占用时，编辑 `config/app.json` 的 `frontendPort` / `serverPort` 即可，Vite 代理与后端会自动读取适配，无需改任何代码。
2. **新增项目**：在控制台"登记新项目"填写目标工作目录，再创建环境并配置凭证字段与注入规则；需要另一套凭证体系直接登记为独立新项目。
3. **自动登录依赖**：未在初始化时安装也没关系——首次点击"自动登录"时，Python 脚本会静默自愈安装 Playwright 与 Chromium 内核。
