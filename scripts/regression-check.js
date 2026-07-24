import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const failures = []

function walkFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(target, predicate) : predicate(target) ? [target] : []
  })
}

function checkVueFiles() {
  const files = walkFiles(path.join(rootDir, 'src'), file => file.endsWith('.vue'))
  for (const file of files) {
    try {
      const source = fs.readFileSync(file, 'utf8')
      const parsed = parse(source, { filename: file })
      if (parsed.errors.length) throw parsed.errors[0]
      const descriptor = parsed.descriptor
      if (descriptor.scriptSetup) compileScript(descriptor, { id: 'data-v-regression' })
      if (descriptor.template) {
        const template = compileTemplate({ source: descriptor.template.content, filename: file, id: 'data-v-regression' })
        if (template.errors.length) throw template.errors[0]
      }
      for (const styleBlock of descriptor.styles) {
        const style = compileStyle({
          source: styleBlock.content,
          filename: file,
          id: 'data-v-regression',
          scoped: styleBlock.scoped
        })
        if (style.errors.length) throw style.errors[0]
        if (/\[data-theme=(?:light|dark)\]\s*\{/.test(style.code)) {
          throw new Error('检测到独立主题根规则，可能污染整个页面')
        }
      }
    } catch (error) {
      failures.push(`${path.relative(rootDir, file)}: ${error.message || error}`)
    }
  }
  return files.length
}

function checkJavaScriptFiles() {
  const roots = ['src', 'server', 'scripts'].map(directory => path.join(rootDir, directory))
  const files = roots.flatMap(directory => walkFiles(directory, file => /\.c?js$/.test(file)))
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (result.status !== 0) {
      failures.push(`${path.relative(rootDir, file)}: JavaScript 语法检查失败`)
    }
  }
  return files.length
}

function checkKnownRegressions() {
  const startRoute = fs.readFileSync(path.join(rootDir, 'server/routes/startRoutes.js'), 'utf8')
  if (!startRoute.includes('cmd.exe /d /s /c') || !startRoute.includes('manager}.cmd')) {
    failures.push('Windows fnm 启动链未通过 cmd.exe 解析包管理器 .cmd')
  }
  if (startRoute.includes('progressOutputCommand') || startRoute.includes('[OmniDev] 正在编译') || startRoute.includes('webpack\\\\.Progress')) {
    failures.push('Windows 本地服务终端仍在加工 Webpack 原生输出')
  }
  if (!startRoute.includes('$serviceExitCode = 0; ${versionedRunCommand}; if ($null -ne $LASTEXITCODE)')) {
    failures.push('Windows 本地服务终端未直接执行原生启动命令')
  }
  if (!startRoute.includes('OMNIDEV_NATIVE_LOG') || !startRoute.includes('OMNIDEV_NATIVE_PRELOAD')) {
    failures.push('Windows 本地服务原生终端输出未通过预加载器同步记录到日志文件')
  }
  const nativeOutputLogger = fs.readFileSync(path.join(rootDir, 'server/utils/nativeOutputLogger.cjs'), 'utf8')
  if (!nativeOutputLogger.includes('stream.isTTY') || !nativeOutputLogger.includes('originalWrite.apply')) {
    failures.push('Windows 本地服务日志复制器没有保留原生 TTY 输出')
  }
  if (!startRoute.includes('NativeConsole') || !startRoute.includes('-Wait')) {
    failures.push('Windows 本地服务终端未关闭快速选择暂停或未保持可停止的父子进程关系')
  }
  if (!startRoute.includes("'utf16le'") || !startRoute.includes("'-EncodedCommand'")) {
    failures.push('Windows 本地服务终端未通过 EncodedCommand 安全传递复杂 PowerShell 命令')
  }
  if (startRoute.includes("envCommand.replace(/\\$/g")) {
    failures.push('Windows 本地服务终端重新使用了易损坏复杂命令的手工美元符转义')
  }
  if (!startRoute.includes("childProc.once('exit'") || !startRoute.includes('clearExitedProcessState')) {
    failures.push('本地服务启动终端退出后未清理幽灵运行状态')
  }
  if (startRoute.indexOf('runCommand = applyPortArgument') > startRoute.indexOf('envPorts[envName] = assignedPort')) {
    failures.push('启动端口状态在启动命令校验前被提前持久化')
  }

  const serverEntry = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8')
  if (!/app\.listen\(PORT,\s*['"]127\.0\.0\.1['"]/.test(serverEntry)) {
    failures.push('本地控制接口未限制到 127.0.0.1')
  }

  const envRoute = fs.readFileSync(path.join(rootDir, 'server/routes/envRoutes.js'), 'utf8')
  if (!envRoute.includes('/api/envs/prepare-local-login') || !envRoute.includes("res.append('Set-Cookie'")) {
    failures.push('本地 Cookie 导航前注入桥接缺失')
  }

  for (const relativePath of [
    'src/views/console/components/settings/SettingsBasic.vue',
    'src/views/console/components/settings/SettingsAbout.vue'
  ]) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
    const deepWatchCount = (source.match(/\{\s*deep:\s*true\s*\}/g) || []).length
    if (deepWatchCount > 1) failures.push(`${relativePath}: 检测到双向深度监听风险`)
  }
}

const vueCount = checkVueFiles()
const jsCount = checkJavaScriptFiles()
checkKnownRegressions()

if (failures.length) {
  console.error('[regression:check] 检查失败:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`[regression:check] 通过：Vue ${vueCount} 个，JavaScript ${jsCount} 个`)
