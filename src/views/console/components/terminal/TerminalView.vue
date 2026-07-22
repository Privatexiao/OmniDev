<script setup>
/**
 * @file TerminalView.vue
 * @description 终端交互视图组件，集成日志分块高亮渲染、环境选项卡切换、快捷/自定义 Shell 指令即时下发执行功能
 */
import { ref, watch, nextTick, computed, onMounted } from 'vue'

const props = defineProps({
  logs: {
    type: String,
    default: ''
  },
  envs: {
    type: Object,
    default: () => ({})
  },
  currentEnv: {
    type: String,
    default: ''
  },
  modelValue: {
    type: String,
    default: ''
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  activeSubproject: {
    type: String,
    default: 'all'
  },
  isSSHConnected: {
    type: Boolean,
    default: false
  },
  isPopup: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'clearLogs',
  'message',
  'refreshLogs',
  'typeChange',
  'closePopup',
  'popup'
])

const terminalType = ref('remote')
const terminalRef = ref(null)

const selectTerminalType = (type) => {
  terminalType.value = type
  emit('typeChange', type)
}

// 核心自愈逻辑：监听日志，一旦改变，内部瞬间自动滚动到最底部
watch(() => props.logs, async () => {
  await nextTick()
  if (terminalRef.value) {
    terminalRef.value.scrollTop = terminalRef.value.scrollHeight
  }
})

const selectEnvLog = (envName) => {
  emit('update:modelValue', envName)
}

const handleClear = () => {
  emit('clearLogs')
}

// 提取并去重物理环境列表，过滤 disable_branch 为 true 的环境
const physicalEnvs = computed(() => {
  const map = {}
  Object.keys(props.envs).forEach(virtualKey => {
    const envName = virtualKey.includes('@') ? virtualKey.split('@')[0] : virtualKey
    const config = props.envs[virtualKey]
    if (config && config.disable_branch) return
    
    if (!map[envName]) {
      map[envName] = {
        envName,
        isRunning: false,
        port: config.port
      }
    }
    
    const isThisVirtualRunning = config.running || (props.isRunning && (props.currentEnv === envName || props.currentEnv === virtualKey))
    if (isThisVirtualRunning) {
      map[envName].isRunning = true
      if (config.port) {
        map[envName].port = config.port
      }
    }
  })
  return Object.values(map)
})

// 快捷指令配置管理
const defaultCommands = ['git checkout .', 'git pull', 'git clean -df', 'git branch | grep "*"']
const quickCommands = ref([])
const isEditMode = ref(false)
const newCommandInput = ref('')
const customCommand = ref('')
const executing = ref(false)

const loadQuickCommands = () => {
  const stored = localStorage.getItem('dev_quick_commands')
  if (stored) {
    try {
      quickCommands.value = JSON.parse(stored)
    } catch (e) {
      quickCommands.value = [...defaultCommands]
    }
  } else {
    quickCommands.value = [...defaultCommands]
    saveQuickCommands()
  }
}

const saveQuickCommands = () => {
  localStorage.setItem('dev_quick_commands', JSON.stringify(quickCommands.value))
}

const addQuickCommand = () => {
  const cmd = newCommandInput.value.trim()
  if (!cmd) return
  if (quickCommands.value.includes(cmd)) {
    emit('message', { text: '该指令已存在于快捷列表中', type: 'warning' })
    return
  }
  quickCommands.value.push(cmd)
  saveQuickCommands()
  newCommandInput.value = ''
  emit('message', { text: '快捷指令新增成功', type: 'success' })
}

const deleteQuickCommand = (idx) => {
  quickCommands.value.splice(idx, 1)
  saveQuickCommands()
  emit('message', { text: '快捷指令已移除', type: 'info' })
}

// 终端日志净化流解析
const purifiedTerminalLines = computed(() => {
  if (!props.logs) return []
  const lines = props.logs.split('\n')
  const result = []
  
  lines.forEach((line, idx) => {
    const cleanLine = line.replace(/\x1B(?:\[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    const normalizedLine = cleanLine.replace(/鉃\?/g, '➜').replace(/鈱\?/g, '⌥').replace(/鈬\?/g, '⇧')
    const trimmed = normalizedLine.trim()
    if (trimmed === '') return

    let textToShow = normalizedLine
    const prefixRegex = /^\[\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2}\]\s*(?:\[项目:[^\]]+\]\s*)?(?:\[子项目:[^\]]+\]\s*)?(?:\[环境:[^\]]+\]\s*)?\[(Command|System|Startup|Build|Command Error)\]\s*/
    if (prefixRegex.test(normalizedLine)) {
      textToShow = normalizedLine.replace(prefixRegex, '')
    }

    const pureTrim = textToShow.trim()
    if (pureTrim === '') return

    let type = 'stdout'
    if (pureTrim.includes('🟢 [远程 SSH 端] 下发指令:') || pureTrim.includes('🟢 下发指令:')) {
      type = 'input'
      const match = pureTrim.match(/\$ (.*?)(?=\s*\(工作目录:|$)/)
      textToShow = match ? match[1] : pureTrim.replace(/🟢\s*\[远程\s*SSH\s*端\]\s*下发指令:\s*/i, '')
    } else if (pureTrim.includes('成功登录远程服务器') || pureTrim.includes('执行指令:') || pureTrim.includes('🔚 远程指令执行结束') || pureTrim.includes('🔚 指令执行结束')) {
      return
    } else if (pureTrim.includes('fatal:') || pureTrim.includes('error:') || pureTrim.includes('ERROR:')) {
      type = 'error'
      textToShow = pureTrim
    } else {
      let cleanText = pureTrim.replace(/^✨\s*\[Remote Server\]\s*/i, '').replace(/^\[Remote Server\]\s*/i, '').replace(/^\[Remote Server Error\]\s*/i, '')
      if (cleanText.includes('Already up to date') || cleanText.includes('已经是最新的')) {
        cleanText = cleanText.replace(/^✨\s*/, '').trim()
      }
      textToShow = cleanText
    }

    result.push({
      id: `term-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      type,
      text: textToShow
    })
  })
  return result
})

// 终端日志分段归拢合并
const parsedLogBlocks = computed(() => {
  const lines = purifiedTerminalLines.value
  if (lines.length === 0) return []
  const blocks = []
  let currentBlock = null
  
  lines.forEach(line => {
    if (!currentBlock) {
      currentBlock = { id: line.id, type: line.type, text: line.text }
    } else if (currentBlock.type === line.type) {
      currentBlock.text += '\n' + line.text
    } else {
      blocks.push(currentBlock)
      currentBlock = { id: line.id, type: line.type, text: line.text }
    }
  })
  if (currentBlock) blocks.push(currentBlock)
  return blocks
})

const isCurrentEnvRunning = computed(() => {
  const target = props.modelValue || props.currentEnv
  if (!target) return false
  const match = physicalEnvs.value.find(item => item.envName === target)
  return match ? match.isRunning : false
})

// 执行命令
const executeCommand = async (cmdText) => {
  if (!cmdText || !cmdText.trim()) return
  const cleanCmd = cmdText.trim()
  if (cleanCmd.toLowerCase() === 'clear' || cleanCmd.toLowerCase() === 'cls') {
    customCommand.value = ''
    handleClear()
    return
  }
  
  executing.value = true
  let targetEnv = props.modelValue || props.currentEnv
  if (targetEnv && !targetEnv.includes('@')) {
    const sub = props.activeSubproject === 'all' ? 'manage' : props.activeSubproject
    targetEnv = `${targetEnv}@${sub}`
  }
  
  try {
    const res = await fetch('/api/terminal/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: cleanCmd,
        env: targetEnv,
        executionMode: 'remote'
      })
    })
    
    const data = await res.json()
    if (data.success) {
      if (cleanCmd === customCommand.value.trim()) {
        customCommand.value = ''
      }
      emit('refreshLogs')
      setTimeout(() => {
        emit('refreshLogs')
      }, 300)
    } else {
      emit('message', { text: data.error || '执行命令失败', type: 'error' })
    }
  } catch (err) {
    console.error('发送命令失败:', err)
    emit('message', { text: '发送命令网络失败: ' + err.message, type: 'error' })
  } finally {
    executing.value = false
  }
}

// 🔌 手动断开 SSH 长连接管理
const disconnecting = ref(false)
const handleDisconnect = async () => {
  if (disconnecting.value) return
  disconnecting.value = true
  try {
    const res = await fetch('/api/ssh/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await res.json()
    if (data.success) {
      emit('message', { text: data.message, type: 'info' })
      emit('refreshLogs')
    }
  } catch (err) {
    emit('message', { text: '断开连接失败: ' + err.message, type: 'error' })
  } finally {
    disconnecting.value = false
  }
}

// 📂 一键打开运行日志所在文件夹
const openingLogFolder = ref(false)
const openLogFolder = async () => {
  if (openingLogFolder.value) return
  openingLogFolder.value = true
  try {
    const res = await fetch('/api/system/open-log-dir', { method: 'POST' })
    const contentType = res.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const data = await res.json()
      if (res.ok && data.success) {
        emit('message', { text: data.message || '已成功打开日志目录', type: 'success' })
      } else {
        emit('message', { text: data.error || '打开日志目录失败', type: 'error' })
      }
    } else {
      emit('message', { text: '打开日志目录失败：检测到后端服务未启动或未重启，请重新运行 node server.js 重启后端以加载新接口！', type: 'error' })
    }
  } catch (err) {
    emit('message', { text: '请求打开日志目录失败: ' + err.message, type: 'error' })
  } finally {
    openingLogFolder.value = false
  }
}

onMounted(() => {
  loadQuickCommands()
})



</script>

<template>
  <div class="terminal-content">
    <div class="terminal-header">
      <div class="terminal-title-row">
        <!-- 🖥️ Segmented Tabs 切换器 -->
        <div class="terminal-type-tabs-container" :class="{ 'type-tabs-popup': isPopup }">
          <button 
            class="type-tab-btn" 
            :class="{ active: terminalType === 'remote' }"
            @click="selectTerminalType('remote')"
          >
            🖥️ 远程终端
          </button>
          <button 
            class="type-tab-btn" 
            :class="{ active: terminalType === 'local' }"
            @click="selectTerminalType('local')"
          >
            💻 本地日志
          </button>
          <span class="popup-debug-badge" v-if="isPopup">全屏调试模式</span>
        </div>
        <div class="terminal-actions">
          <button class="btn-open-log-dir" @click="openLogFolder" :disabled="openingLogFolder" title="打开运行日志文件所在的系统文件夹">
            📂 {{ openingLogFolder ? '打开中...' : '日志目录' }}
          </button>
          <button class="btn-popup-logs" v-if="!isPopup" @click="emit('popup')" title="弹出全屏大终端，查看超长实时滚动日志">
            📟 全屏
          </button>
          <button class="btn-clear-logs" @click="handleClear" title="清空当前屏幕上显示的所有日志记录">
            🧹 清屏
          </button>
          <button v-if="terminalType === 'remote'" class="btn-disconnect-ssh" @click="handleDisconnect" :disabled="disconnecting" title="手动断开与远程服务器的活动 SSH 长连接">
            🔌 {{ disconnecting ? '断开中...' : '断开' }}
          </button>
          <button class="btn-close-popup" v-if="isPopup" @click="emit('closePopup')">
            ❌ 关闭
          </button>
        </div>
      </div>
      
      <!-- 🌿 专属分环境日志切换选项卡 -->
      <div class="log-env-tabs" v-if="physicalEnvs.length > 0">
        <button 
          v-for="item in physicalEnvs" 
          :key="item.envName"
          class="log-tab-btn"
          :class="{ 
            active: modelValue === item.envName || (!modelValue && currentEnv === item.envName),
            'running-glow': item.isRunning 
          }"
          @click="selectEnvLog(item.envName)"
        >
          <span class="dot" v-if="item.isRunning"></span>
          {{ item.envName }}
        </button>
      </div>
    </div>
    
    <div ref="terminalRef" class="terminal-body">
      <template v-if="parsedLogBlocks.length > 0">
        <div 
          v-for="block in parsedLogBlocks" 
          :key="block.id" 
          :class="['log-block', 'log-block-' + block.type]"
        >
          <pre class="block-content">{{ block.text }}</pre>
        </div>
      </template>
      <div v-else class="log-empty">
        <template v-if="terminalType === 'remote'">
          {{ isSSHConnected ? '🖥️ 远程控制台已连接就绪，等待下发远程指令...' : '等待建立远程服务端连接...' }}
        </template>
        <template v-else>
          💻 本地服务控制台就绪，尚未产生任何本地开发日志（请先在环境卡片中启动开发服务）...
        </template>
      </div>
    </div>

    <!-- 🖥️ 快捷指令与即时 Shell 执行条 -->
    <div v-if="terminalType === 'remote'" class="terminal-footer">
      <!-- 快捷命令选项行 -->
      <div class="quick-commands-row">
        <span class="quick-title">⚡ 快捷指令:</span>
        <div class="quick-list">
          <button 
            v-for="(cmd, idx) in quickCommands" 
            :key="idx" 
            class="btn-quick-cmd"
            @click="isEditMode ? null : executeCommand(cmd)"
            :title="isEditMode ? '点击右侧小红叉删除此项' : '点击立即送入服务端执行'"
          >
            <code>{{ cmd }}</code>
            <span v-if="isEditMode" class="quick-cmd-del" @click.stop="deleteQuickCommand(idx)">×</span>
          </button>
          
          <button class="btn-quick-edit" @click="isEditMode = !isEditMode" :class="{ 'editing-active': isEditMode }">
            {{ isEditMode ? '💾 完成管理' : '⚙️ 管理指令' }}
          </button>
        </div>
      </div>

      <!-- 新增快捷指令编辑区 -->
      <div class="add-command-bar" v-if="isEditMode">
        <input 
          type="text" 
          v-model="newCommandInput" 
          placeholder="➕ 输入新的快捷 Shell 指令 (如: npm run build)..." 
          class="add-cmd-input"
          @keyup.enter="addQuickCommand"
        />
        <button class="btn-add-cmd" @click="addQuickCommand">➕ 新增</button>
      </div>

      <!-- 即时 Shell 输入确定框 (回车送达) -->
      <div class="shell-input-container">
        <span class="shell-prompt">$</span>
        <input 
          type="text" 
          v-model="customCommand" 
          placeholder="💡 输入远程指令并回车 (Enter) 直接在测试服务器执行..." 
          class="shell-input"
          :disabled="executing"
          @keyup.enter="executeCommand(customCommand)"
        />
        <button 
          class="btn-shell-send" 
          @click="executeCommand(customCommand)" 
          :disabled="executing || !customCommand.trim()"
        >
          {{ executing ? '⏳' : '⏎ 送达' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "./TerminalPanel.css";
</style>

