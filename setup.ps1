# 一键初始化脚本 (首次 clone 项目后运行此脚本即可快速初始化环境)
#
# 用法:
#   .\setup.ps1                  # 交互式一键初始化 (复制配置 + npm install + 自动登录依赖, 结尾询问是否启动)
#   .\setup.ps1 -Yes             # 无人值守: 全部默认 Yes, 但不自动启动
#   .\setup.ps1 -Run             # 初始化完成后直接 npm run dev 启动控制台
#   .\setup.ps1 -Yes -Run        # 全自动: 装好一切并直接启动
#   .\setup.ps1 -SkipInstall     # 跳过 npm install
#   .\setup.ps1 -SkipAutoLogin   # 跳过 Python/Playwright 自动登录依赖
#
# 若提示"无法加载脚本, 因为在此系统上禁止运行脚本", 请先执行:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

param(
    [switch]$Yes,            # 无人值守, 所有交互默认 Yes
    [switch]$Run,            # 初始化后自动启动 npm run dev
    [switch]$SkipInstall,    # 跳过 npm install
    [switch]$SkipAutoLogin   # 跳过自动登录依赖安装
)

$ErrorActionPreference = 'Stop'

# 统一的 Yes/No 询问助手: 回车默认 Yes; -Yes 模式直接返回 true 不阻塞
function Confirm-Step {
    param([string]$Message)
    if ($Yes) { return $true }
    $answer = Read-Host "$Message [Y/n]"
    return ($answer -eq '' -or $answer -eq 'Y' -or $answer -eq 'y')
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   OmniDev - 一键初始化向导" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$configDir = Join-Path $PSScriptRoot "config"
$exampleDir = Join-Path $PSScriptRoot "config.example"

# ---------------------------------------------------------------------------
# 步骤 1: 复制示例配置 config.example/ -> config/
# ---------------------------------------------------------------------------
Write-Host "[步骤 1/4] 初始化本地私有配置 config/" -ForegroundColor Cyan
if (Test-Path $configDir) {
    Write-Host "[√] config/ 目录已存在, 跳过初始化..." -ForegroundColor Green
    Write-Host "    提示: 如需重新初始化, 请先手动删除 config/ 目录" -ForegroundColor Yellow
} else {
    if (Test-Path $exampleDir) {
        Write-Host "[*] 正在从 config.example/ 创建个人配置 config/ ..." -ForegroundColor Yellow
        Copy-Item -Path $exampleDir -Destination $configDir -Recurse
        Write-Host "[√] config/ 目录已成功创建！" -ForegroundColor Green
    } else {
        Write-Host "[!] 错误: config.example/ 目录不存在, 请检查项目完整性" -ForegroundColor Red
        exit 1
    }
}

# ---------------------------------------------------------------------------
# 步骤 2: 检测 Node/npm 并自动安装前端与后端依赖
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[步骤 2/4] 安装项目依赖 (npm install)" -ForegroundColor Cyan
if ($SkipInstall) {
    Write-Host "[*] 已按参数跳过 npm install。" -ForegroundColor Yellow
} else {
    $nodeVersion = $null
    try { $nodeVersion = & node --version 2>&1 } catch { $nodeVersion = $null }
    if (-not $nodeVersion -or $LASTEXITCODE -ne 0) {
        Write-Host "[!] 未检测到 Node.js, 请先安装 Node.js (建议 LTS 版本) 后重新运行本脚本。" -ForegroundColor Red
        Write-Host "    下载地址: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[√] 检测到 Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "[*] 正在安装依赖, 首次安装可能需要几分钟, 请保持网络通畅..." -ForegroundColor Yellow

    Push-Location $PSScriptRoot
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] npm install 失败, 请检查网络或 npm 源后重试。" -ForegroundColor Red
            Pop-Location
            exit 1
        }
        Write-Host "[√] 项目依赖安装完成！" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 步骤 3: 安装自动登录依赖 (Python Playwright & Chromium)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[步骤 3/4] 🤖 自动登录依赖 (Python Playwright & Chromium 内核)" -ForegroundColor Cyan

$doAutoLogin = $false
if ($SkipAutoLogin) {
    Write-Host "[*] 已按参数跳过自动登录依赖安装。" -ForegroundColor Yellow
} else {
    $doAutoLogin = Confirm-Step "是否现在安装自动登录依赖环境?"
}

if ($doAutoLogin) {
    Write-Host "[*] 正在检测 Python 环境..." -ForegroundColor Yellow
    $pythonVersion = $null
    try { $pythonVersion = & python --version 2>&1 } catch { $pythonVersion = $null }
    if (-not $pythonVersion -or $LASTEXITCODE -ne 0) {
        Write-Host "[!] 未检测到 python 命令, 请确认已安装 Python 并勾选加入 PATH！" -ForegroundColor Red
        Write-Host "    (可稍后在点击自动登录按钮时, 由系统静默自愈安装)" -ForegroundColor Yellow
    } else {
        Write-Host "[√] 检测到 Python 环境: $pythonVersion" -ForegroundColor Green
        Write-Host "[*] 正在安装 Playwright 依赖库 (采用清华大学高速镜像源)..." -ForegroundColor Yellow
        & python -m pip install playwright -i https://pypi.tuna.tsinghua.edu.cn/simple

        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] 安装 playwright 依赖库失败, 请检查您的网络连接" -ForegroundColor Red
        } else {
            Write-Host "[√] Playwright 依赖库安装成功！" -ForegroundColor Green
            Write-Host "[*] 正在下载 Chromium 浏览器物理内核 (首次约 10-20 秒, 请保持网络通畅)..." -ForegroundColor Yellow
            & python -m playwright install chromium

            if ($LASTEXITCODE -ne 0) {
                Write-Host "[!] 下载 Chromium 内核失败, 后续使用时系统会自愈修补" -ForegroundColor Red
            } else {
                Write-Host "[√] 🤖 Chromium 浏览器物理内核下载并修补成功！" -ForegroundColor Green
            }
        }
    }
} elseif (-not $SkipAutoLogin) {
    Write-Host "[*] 好的, 已跳过自动登录依赖安装。" -ForegroundColor Yellow
    Write-Host "    提示: 后续点击「自动登录」按钮时, 系统仍会静默自愈装配下载。" -ForegroundColor Gray
}

# ---------------------------------------------------------------------------
# 步骤 4: 提示后续配置, 并询问是否立即启动
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   ✅ 初始化完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  请按需编辑以下配置 (也可启动后在控制台界面里设置):" -ForegroundColor White
Write-Host "    1. config/projects.json  → 本地项目名称与绝对路径" -ForegroundColor Gray
Write-Host "    2. config/ssh.json       → 远程开发服务器 SSH 连接信息" -ForegroundColor Gray
Write-Host "    3. config/app.json       → 应用名称、端口、子项目预设 (可选)" -ForegroundColor Gray
Write-Host ""

$launch = $Run
if (-not $launch) {
    $launch = Confirm-Step "是否现在启动 OmniDev 控制台 (npm run dev)?"
}

if ($launch) {
    Write-Host ""
    Write-Host "[*] 正在启动控制台 (npm run dev)..." -ForegroundColor Yellow
    Push-Location $PSScriptRoot
    try {
        & npm run dev
    } finally {
        Pop-Location
    }
} else {
    Write-Host ""
    Write-Host "  稍后可手动启动控制台:" -ForegroundColor White
    Write-Host "    npm run dev" -ForegroundColor Green
    Write-Host ""
}
