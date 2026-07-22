import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import readline from 'readline'
import { fileURLToPath } from 'url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const versionPath = path.join(rootDir, 'version.json')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle')
const tauriCliPath = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const defaultPrivateKeyPath = path.join(
  path.dirname(rootDir),
  `${path.basename(rootDir)}-key`,
  'omnidev-updater.key'
)

function printUsage() {
  console.log(`
OmniDev 一键签名发布

用法:
  npm run release
  npm run release -- [--automatic|--manual] [--dry-run]
  node scripts/release.js <版本号> <更新说明> [--automatic|--manual] [--dry-run]

示例:
  npm run release
  npm run release -- --manual
  npm run release -- --dry-run

默认策略:
  主版本号变化使用 manual，其余版本使用 automatic；可通过参数显式覆盖。
  私钥默认从项目同级的 OmniDev-key/omnidev-updater.key 自动读取。
  本机密钥默认使用空密码；非空密码可通过 TAURI_SIGNING_PRIVATE_KEY_PASSWORD 设置。
`)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) throw new Error(`版本号格式非法: ${value || '<empty>'}`)
  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || ''
  }
}

function compareVersions(left, right) {
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) return left[field] > right[field] ? 1 : -1
  }
  if (left.prerelease === right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true })
}

function parseArgs(argv) {
  const flags = new Set(argv.filter(arg => arg.startsWith('-')))
  const positional = argv.filter(arg => !arg.startsWith('-'))
  if (flags.has('--help') || flags.has('-h')) return { help: true }
  if (flags.has('--manual') && flags.has('--automatic')) {
    throw new Error('不能同时指定 --manual 和 --automatic')
  }
  const supportedFlags = new Set(['--manual', '--automatic', '--dry-run'])
  const unknownFlag = [...flags].find(flag => !supportedFlags.has(flag))
  if (unknownFlag) throw new Error(`不支持的参数: ${unknownFlag}`)
  return {
    help: false,
    version: positional[0] || '',
    notes: positional.slice(1).join(' ').trim(),
    explicitMode: flags.has('--manual') ? 'manual' : flags.has('--automatic') ? 'automatic' : null,
    dryRun: flags.has('--dry-run')
  }
}

async function completeInteractiveArgs(args) {
  if (args.help || (args.version && args.notes)) return args
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('非交互环境必须通过参数提供版本号和更新说明')
  }

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
  const question = message => new Promise(resolve => prompt.question(message, resolve))
  try {
    const version = args.version || (await question('目标版本号（例如 0.1.4）: ')).trim()
    const notes = args.notes || (await question('更新说明: ')).trim()
    if (!version) throw new Error('版本号不能为空')
    if (!notes) throw new Error('更新说明不能为空')
    return { ...args, version, notes }
  } finally {
    prompt.close()
  }
}

function runCommand(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    shell: false
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`命令执行失败，退出码: ${result.status}`)
}

function renderDownloadUrl(template, version) {
  const value = String(template || '').trim()
  if (!value) throw new Error('version.json.downloadUrlTemplate 不能为空')
  const rendered = value.replaceAll('{{version}}', version)
  const url = new URL(rendered)
  if (url.protocol !== 'https:') throw new Error('正式更新安装包地址必须使用 HTTPS')
  return url
}

function validateSigningConfig(dryRun) {
  const config = readJson(tauriConfigPath)
  const pubkey = String(config.plugins?.updater?.pubkey || '').trim()
  const missingPubkey = !pubkey || pubkey === 'REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY'
  const privateKeyValue = String(process.env.TAURI_SIGNING_PRIVATE_KEY || '').trim()
  const configuredKeyPath = String(process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || '').trim()
  const usableConfiguredPath = configuredKeyPath && fs.existsSync(configuredKeyPath)
  const usableDefaultPath = fs.existsSync(defaultPrivateKeyPath)
  const resolvedKeyPath = usableConfiguredPath
    ? configuredKeyPath
    : usableDefaultPath ? defaultPrivateKeyPath : ''
  if (!privateKeyValue && resolvedKeyPath) {
    const privateKeyContent = fs.readFileSync(resolvedKeyPath, 'utf8').trim()
    if (!privateKeyContent) throw new Error(`updater 私钥文件为空: ${resolvedKeyPath}`)
    process.env.TAURI_SIGNING_PRIVATE_KEY = privateKeyContent
    console.log(`[release] 已安全加载私钥: ${resolvedKeyPath}`)
  }
  if (!Object.hasOwn(process.env, 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD')) {
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
  }
  const missingPrivateKey = !privateKeyValue && !usableConfiguredPath && !usableDefaultPath
  if (dryRun) {
    if (missingPubkey) console.warn('[release] 预览警告：尚未配置 updater 公钥。')
    if (missingPrivateKey) console.warn('[release] 预览警告：未找到 updater 私钥。')
    return
  }
  if (missingPubkey) throw new Error('尚未配置 updater 公钥，请先替换 tauri.conf.json 中的占位值')
  if (missingPrivateKey) {
    throw new Error(`未找到 updater 私钥，请设置 TAURI_SIGNING_PRIVATE_KEY_PATH 或放置到 ${defaultPrivateKeyPath}`)
  }
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(filePath) : [filePath]
  })
}

function findSignedArtifact(expectedFileName, version) {
  const files = listFiles(bundleDir)
  const artifact = files.find(filePath => path.basename(filePath).toLowerCase() === expectedFileName.toLowerCase())
  if (!artifact) {
    const candidates = files
      .filter(filePath => filePath.toLowerCase().endsWith('.exe') && path.basename(filePath).includes(version))
      .map(filePath => path.relative(rootDir, filePath))
    const detail = candidates.length ? `\n检测到的候选安装包:\n- ${candidates.join('\n- ')}` : ''
    throw new Error(`未找到与 downloadUrlTemplate 文件名一致的安装包: ${expectedFileName}${detail}`)
  }

  const signaturePath = `${artifact}.sig`
  if (!fs.existsSync(signaturePath)) {
    throw new Error(`未找到安装包签名文件: ${path.relative(rootDir, signaturePath)}`)
  }
  const signature = fs.readFileSync(signaturePath, 'utf8').trim()
  if (!signature) throw new Error(`安装包签名文件为空: ${path.relative(rootDir, signaturePath)}`)
  return { artifact, signaturePath, signature }
}

async function main() {
  const args = await completeInteractiveArgs(parseArgs(process.argv.slice(2)))
  if (args.help) {
    printUsage()
    return
  }

  const currentInfo = readJson(versionPath)
  const currentVersion = parseVersion(currentInfo.version)
  const nextVersion = parseVersion(args.version)
  const comparison = compareVersions(nextVersion, currentVersion)
  if (comparison < 0) throw new Error(`目标版本 ${args.version} 不能低于当前版本 ${currentInfo.version}`)
  if (comparison === 0 && String(currentInfo.updaterSignature || '').trim()) {
    throw new Error(`版本 ${args.version} 已包含签名，请使用更高版本号发布`)
  }

  const inferredMode = comparison === 0
    ? (currentInfo.updateMode === 'manual' ? 'manual' : 'automatic')
    : (nextVersion.major > currentVersion.major ? 'manual' : 'automatic')
  const updateMode = args.explicitMode || inferredMode
  const downloadUrl = renderDownloadUrl(currentInfo.downloadUrlTemplate, args.version)
  const expectedFileName = decodeURIComponent(path.basename(downloadUrl.pathname))
  if (!expectedFileName) throw new Error('downloadUrlTemplate 未包含安装包文件名')

  console.log('[release] 发布计划')
  console.log(`- 当前版本: ${currentInfo.version}`)
  console.log(`- 目标版本: ${args.version}${comparison === 0 ? '（继续未完成发布）' : ''}`)
  console.log(`- 更新模式: ${updateMode}${args.explicitMode ? '（显式指定）' : '（自动判断）'}`)
  console.log(`- 更新说明: ${args.notes}`)
  console.log(`- 安装包名: ${expectedFileName}`)

  validateSigningConfig(args.dryRun)
  if (args.dryRun) {
    console.log('\n[release] 仅预览，未修改文件、未打包。')
    return
  }

  writeJson(versionPath, {
    ...currentInfo,
    version: args.version,
    updateMode,
    changelog: args.notes,
    updaterSignature: ''
  })

  runCommand(process.execPath, ['scripts/sync-version.js'])
  runCommand(process.execPath, ['scripts/check-version.js'])

  if (!fs.existsSync(tauriCliPath)) {
    throw new Error('未找到项目本地 Tauri CLI，请先确认 node_modules 已完整安装')
  }
  runCommand(process.execPath, [tauriCliPath, 'build'])

  const signedArtifact = findSignedArtifact(expectedFileName, args.version)
  const finalInfo = readJson(versionPath)
  finalInfo.updaterSignature = signedArtifact.signature
  writeJson(versionPath, finalInfo)

  runCommand(process.execPath, ['scripts/sync-version.js'])
  runCommand(process.execPath, ['scripts/check-version.js'])

  console.log('\n[release] 签名发布文件已准备完成，请按以下顺序发布：')
  console.log(`1. 安装包: ${path.relative(rootDir, signedArtifact.artifact)}`)
  console.log(`2. 签名文件: ${path.relative(rootDir, signedArtifact.signaturePath)}`)
  console.log('3. 最后发布: update.json')
  console.log('签名已经回填，请勿再次打包；如重新打包，必须重新执行本命令生成并回填新签名。')
}

try {
  await main()
} catch (error) {
  console.error(`\n[release] 发布准备失败: ${error.message}`)
  console.error('修复问题后可使用相同版本号重新执行；签名完成的版本必须提升版本号。')
  process.exitCode = 1
}
