'use strict'

const fs = require('fs')
const childProcess = require('child_process')

const logFilePath = process.env.OMNIDEV_NATIVE_LOG
const preloadPath = process.env.OMNIDEV_NATIVE_PRELOAD || __filename
const streamMarker = Symbol.for('omnidev.nativeOutputLogger')

let logFileDescriptor = null

function normalizeForLog(chunk, encoding) {
  const text = Buffer.isBuffer(chunk)
    ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8')
    : String(chunk)

  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r(?!\n)/g, '\n')
}

function appendLog(chunk, encoding) {
  if (!logFilePath) return

  try {
    if (logFileDescriptor === null) {
      logFileDescriptor = fs.openSync(logFilePath, 'a')
    }
    fs.writeSync(logFileDescriptor, normalizeForLog(chunk, encoding), null, 'utf8')
  } catch {
    // 日志文件暂时不可写时不能影响项目本身的启动和终端输出。
  }
}

function mirrorTerminalStream(stream) {
  if (!stream || !stream.isTTY || stream[streamMarker]) return

  const originalWrite = stream.write
  Object.defineProperty(stream, streamMarker, { value: true })
  stream.write = function writeWithLogCopy(chunk, encoding, callback) {
    appendLog(chunk, encoding)
    return originalWrite.apply(this, arguments)
  }
}

function appendPreloadOption(nodeOptions) {
  const currentOptions = String(nodeOptions || '')
  if (currentOptions.includes(preloadPath)) return currentOptions
  return `${currentOptions} --require ${JSON.stringify(preloadPath)}`.trim()
}

function withPreloadEnvironment(options) {
  const currentOptions = options && typeof options === 'object' ? options : {}
  const environment = { ...(currentOptions.env || process.env) }
  environment.OMNIDEV_NATIVE_LOG = logFilePath
  environment.OMNIDEV_NATIVE_PRELOAD = preloadPath
  environment.NODE_OPTIONS = appendPreloadOption(environment.NODE_OPTIONS)
  return { ...currentOptions, env: environment }
}

function patchSpawn(methodName) {
  const originalMethod = childProcess[methodName]
  childProcess[methodName] = function spawnWithPreload() {
    const args = Array.from(arguments)
    const optionsIndex = Array.isArray(args[1]) ? 2 : 1
    args[optionsIndex] = withPreloadEnvironment(args[optionsIndex])
    return originalMethod.apply(this, args)
  }
}

if (logFilePath) {
  mirrorTerminalStream(process.stdout)
  mirrorTerminalStream(process.stderr)
  patchSpawn('spawn')
  patchSpawn('spawnSync')
}
