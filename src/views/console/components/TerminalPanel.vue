<script setup>
import { ref, watch, nextTick, computed, onMounted } from 'vue'


// 声明 Props 验证，指定 Type 与 Default 默认值
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
  }
})

const emit = defineEmits(['update:modelValue', 'clearLogs', 'message', 'refreshLogs', 'typeChange', 'collapseChange'])

const terminalType = ref('remote') // 'remote' | 'local'

const togglePanel = () => {
  isCollapsed.value = !isCollapsed.value
}

const selectTerminalType = (type) => {
  terminalType.value = type
  emit('typeChange', type)
}

const terminalRef = ref(null)

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
    
    // 只要该物理环境下的任意一个虚拟子项目处于 running 状态，或者 props.currentEnv 匹配，或者 config.running 满足
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

// 核心自愈逻辑：监听日志，一旦改变，内部瞬间自动滚动到最底部
watch(() => props.logs, async () => {
  await nextTick()
  if (terminalRef.value) {
    terminalRef.value.scrollTop = terminalRef.value.scrollHeight
  }
  if (popupTerminalRef.value) {
    popupTerminalRef.value.scrollTop = popupTerminalRef.value.scrollHeight
  }
})

const selectEnvLog = (envName) => {
  emit('update:modelValue', envName)
}

const handleClear = () => {
  emit('clearLogs')
}

// 📂 一键打开运行日志所在文件夹的系统文件管理器
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
      // 捕获非 JSON 响应（代表后端未启动，或者后端未重启未载入新路由被回退至 index.html）
      emit('message', { text: '打开日志目录失败：检测到后端服务未启动或未重启，请重新运行 node server.js 重启后端以加载新接口！', type: 'error' })
    }
  } catch (err) {
    emit('message', { text: '请求打开日志目录失败: ' + err.message, type: 'error' })
  } finally {
    openingLogFolder.value = false
  }
}

// ==========================================
// 🖥️ 快捷命令管理及即时 Shell 执行系统
// ==========================================
const defaultCommands = ['git checkout .', 'git pull', 'git clean -df', 'git branch | grep "*"']
const quickCommands = ref([])
const isEditMode = ref(false)
const newCommandInput = ref('')
const customCommand = ref('')
const executing = ref(false)
// 🌐 专职远程 SSH 执行模式

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

const executeCommand = async (cmdText) => {
  if (!cmdText || !cmdText.trim()) return
  const cleanCmd = cmdText.trim()
  
  // 🌟 智能拦截终端 clear/cls 命令，直接就地触发清屏擦除，无须下发服务器，绝对保障长连接存活！
  if (cleanCmd.toLowerCase() === 'clear' || cleanCmd.toLowerCase() === 'cls') {
    customCommand.value = ''
    handleClear()
    return
  }
  
  executing.value = true
  
  // 智能推导带子项目的虚拟环境 Key 作为执行环境
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
        executionMode: 'remote' // 🌐 统一且专职使用远程 SSH 模式执行
      })
    })
    
    const data = await res.json()
    if (data.success) {
      // 成功发送后，清空即时输入框
      if (cleanCmd === customCommand.value.trim()) {
        customCommand.value = ''
      }
      // emit('message', { text: data.message, type: 'success' })
      
      // 🚀 立即强制拉取一次最新日志，并在300毫秒后进行二次增量日志校验，保障命令及其输出瞬间回显！
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

// 🚀 终端高精脱壳流解析系统（彻底剥除冗长前缀、还原100%纯净的原生Linux终端视效）
const purifiedTerminalLines = computed(() => {
  if (!props.logs) return []
  const lines = props.logs.split('\n')
  const result = []
  
  lines.forEach((line, idx) => {
    // 1. 过滤清除 ANSI Escape 控制字符/颜色码
    const cleanLine = line.replace(/\x1B(?:\[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    
    // 2. 智能修正错乱字符
    const normalizedLine = cleanLine
      .replace(/鉃\?/g, '➜')
      .replace(/鈱\?/g, '⌥')
      .replace(/鈬\?/g, '⇧')
    
    const trimmed = normalizedLine.trim()
    if (trimmed === '') return // 忽略完全的空白行

    // 3. 智能正则剔除控制台统一的日志前缀，只留纯粹命令数据，质感直逼真实 Shell！
    let textToShow = normalizedLine
    const prefixRegex = /^\[\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2}\]\s*(?:\[项目:[^\]]+\]\s*)?(?:\[子项目:[^\]]+\]\s*)?(?:\[环境:[^\]]+\]\s*)?\[(Command|System|Startup|Build|Command Error)\]\s*/
    
    if (prefixRegex.test(normalizedLine)) {
      textToShow = normalizedLine.replace(prefixRegex, '')
    }

    const pureTrim = textToShow.trim()
    if (pureTrim === '') return

    let type = 'stdout' // 默认为常规标准输出
    
    // 4. 分析提取真实的指令类型，向真实终端对齐
    if (pureTrim.includes('🟢 [远程 SSH 端] 下发指令:') || pureTrim.includes('🟢 下发指令:')) {
      type = 'input'
      const match = pureTrim.match(/\$ (.*?)(?=\s*\(工作目录:|$)/)
      textToShow = match ? match[1] : pureTrim.replace(/🟢\s*\[远程\s*SSH\s*端\]\s*下发指令:\s*/i, '')
    } else if (pureTrim.includes('成功登录远程服务器') || pureTrim.includes('执行指令:') || pureTrim.includes('🔚 远程指令执行结束') || pureTrim.includes('🔚 指令执行结束')) {
      return // 默默滤除连接成功、指令下发、以及正常结束的辅助系统日志，前端不作展示（仅保留在后台物理日志归档中）
    } else if (pureTrim.includes('fatal:') || pureTrim.includes('error:') || pureTrim.includes('ERROR:')) {
      type = 'error'
      textToShow = pureTrim
    } else {
      // 🌟 高精剥壳净化：智能剔除 [Remote Server] 业务前缀；当遇到"已经是最新的"时，仅保留最纯粹的原生结果回显（完全不要icon）
      let cleanText = pureTrim
        .replace(/^✨\s*\[Remote Server\]\s*/i, '')
        .replace(/^\[Remote Server\]\s*/i, '')
        .replace(/^\[Remote Server Error\]\s*/i, '')
      
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

// 🚀 终端日志分段归拢系统（将同类型的多行输出归类合并为同一区块，实现像真实终端那样一段一段的展示效果，大幅减少视觉碎片化）
const parsedLogBlocks = computed(() => {
  const lines = purifiedTerminalLines.value
  if (lines.length === 0) return []
  
  const blocks = []
  let currentBlock = null
  
  lines.forEach(line => {
    if (!currentBlock) {
      currentBlock = {
        id: line.id,
        type: line.type,
        text: line.text
      }
    } else if (currentBlock.type === line.type) {
      // 如果属于同一种输出类型，则用换行符拼接文本归拢为一段
      currentBlock.text += '\n' + line.text
    } else {
      // 遇到不同类型，则将当前已归拢的段推入结果列表，并开启新的归拢段
      blocks.push(currentBlock)
      currentBlock = {
        id: line.id,
        type: line.type,
        text: line.text
      }
    }
  })
  
  if (currentBlock) {
    blocks.push(currentBlock)
  }
  
  return blocks
})

const isCurrentEnvRunning = computed(() => {
  const target = props.modelValue || props.currentEnv
  if (!target) return false
  const match = physicalEnvs.value.find(item => item.envName === target)
  return match ? match.isRunning : false
})

// 自动加载
loadQuickCommands()

// 🔌 手动断开 SSH 长连接管理
const disconnecting = ref(false)
const handleDisconnect = async () => {
  if (disconnecting.value) return // 🔒 物理防重复点击锁，规避多次点击并发长连接释放
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

// 🚀 终端日志收起状态
const isCollapsed = ref(true)

onMounted(() => {
  const saved = localStorage.getItem('terminal_collapsed')
  if (saved !== null) {
    isCollapsed.value = saved === 'true'
  }
  emit('typeChange', terminalType.value)
})

watch(isCollapsed, (newVal) => {
  localStorage.setItem('terminal_collapsed', String(newVal))
  emit('collapseChange', newVal)
})

const isPopupShow = ref(false)
const popupTerminalRef = ref(null)

watch(isPopupShow, async (newVal) => {
  if (newVal) {
    await nextTick()
    if (popupTerminalRef.value) {
      popupTerminalRef.value.scrollTop = popupTerminalRef.value.scrollHeight
    }
  }
})
</script>

<template>
  <div class="glass-card console-panel" :class="{ 'is-collapsed': isCollapsed }">
    <!-- 🚀 极其精美的侧边悬浮拉手/拉条按钮（合并版） -->
    <button 
      class="terminal-toggle-tab" 
      :class="{ 'active-tab': !isCollapsed }"
      @click="togglePanel" 
      :title="!isCollapsed ? '收起开发控制台' : '展开开发控制台'"
    >
      <span class="toggle-icon">◀</span>
      <div class="toggle-text">
        <span>开</span>
        <span>发</span>
        <span>控</span>
        <span>制</span>
        <span>台</span>
      </div>
    </button>

    <div class="terminal-header">
      <div class="terminal-title-row">
        <!-- 🖥️ 苹果级 Segmented Tabs 切换器 -->
        <div class="terminal-type-tabs-container">
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
        </div>
        <div class="terminal-actions">
          <button class="btn-open-log-dir" @click="openLogFolder" :disabled="openingLogFolder" title="打开运行日志文件所在的系统文件夹">
            📂 {{ openingLogFolder ? '打开中...' : '日志目录' }}
          </button>
          <button class="btn-popup-logs" @click="isPopupShow = true" title="弹出全屏大终端，查看超长实时滚动日志">
            📟 全屏
          </button>
          <button class="btn-clear-logs" @click="handleClear" title="清空当前屏幕上显示的所有日志记录">
            🧹 清屏
          </button>
          <button v-if="terminalType === 'remote'" class="btn-disconnect-ssh" @click="handleDisconnect" :disabled="disconnecting" title="手动断开与远程服务器的活动 SSH 长连接">
            🔌 {{ disconnecting ? '断开中...' : '断开' }}
          </button>
        </div>
      </div>
      
      <!-- 🌿 专属分环境日志切换选项卡 (物理环境聚合归一，去重去杂) -->
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

    <!-- 🖥️ 快捷指令与即时 Shell 执行条 (高透磨砂质感控制流) -->
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
      <div class="add-command-bar animate-zoom" v-if="isEditMode">
        <input 
          type="text" 
          v-model="newCommandInput" 
          placeholder="➕ 输入新的快捷 Shell 指令 (如: npm run build)..." 
          class="add-cmd-input"
          @keyup.enter="addQuickCommand"
        />
        <button class="btn-add-cmd" @click="addQuickCommand">➕ 新增</button>
      </div>

      <!-- ⚡ 物理移除本地端执行目标选择器，纯化远程面板体验 -->

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

  <!-- 🚀 极其奢华的黑客风全屏放大终端弹窗遮罩 -->
  <div class="terminal-popup-overlay" v-if="isPopupShow" @click.self="isPopupShow = false">
    <div class="glass-card terminal-popup-content animate-zoom">
      <div class="terminal-header">
        <div class="terminal-title-row">
          <!-- 🖥️ 苹果级 Segmented Tabs 切换器 -->
          <div class="terminal-type-tabs-container type-tabs-popup">
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
            <span class="popup-debug-badge">全屏调试模式</span>
          </div>
          <div class="terminal-actions">
            <button class="btn-open-log-dir" @click="openLogFolder" :disabled="openingLogFolder" title="打开运行日志文件所在的系统文件夹">
              📂 {{ openingLogFolder ? '打开中...' : '日志目录' }}
            </button>
            <button class="btn-clear-logs" @click="handleClear" title="清空当前屏幕上显示的所有日志记录">
              🧹 清屏
            </button>
            <button v-if="terminalType === 'remote'" class="btn-disconnect-ssh" @click="handleDisconnect" :disabled="disconnecting" title="手动断开与远程服务器的活动 SSH 长连接">
              🔌 {{ disconnecting ? '断开中...' : '断开' }}
            </button>
            <button class="btn-close-popup" @click="isPopupShow = false">
              ❌ 关闭
            </button>
          </div>
        </div>
        
        <!-- 🌿 专属分环境日志切换选项卡 -->
        <div class="log-env-tabs" v-if="physicalEnvs.length > 0" style="margin-top: 8px;">
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
      
      <div ref="popupTerminalRef" class="terminal-body">
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
        <div class="add-command-bar animate-zoom" v-if="isEditMode">
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
  </div>
</template>

<style scoped>
.console-panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 480px; /* 高宽面板，保障指令和日志清晰可见 */
  background: var(--panel-bg);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border-left: var(--border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.15);
  z-index: 200;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s ease, border-color 0.4s ease;
  display: flex;
  flex-direction: column;
}

/* 🚀 抽屉收起状态 */
.console-panel.is-collapsed {
  transform: translateX(100%);
  box-shadow: none;
}

/* 🚀 侧边悬浮拉手标签（基础样式） */
.terminal-toggle-tab {
  position: absolute;
  left: -32px;
  width: 32px;
  height: 140px; /* 合并为单一拉手，设为 140px 高度，高雅大气 */
  top: 50%;
  transform: translate(0, -50%); /* 完美的垂直绝对居中 */
  background: var(--panel-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: var(--border);
  border-right: none;
  border-radius: 12px 0 0 12px;
  box-shadow: -4px 0 15px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px; /* 箭头和堆叠文字之间的舒适缝隙 */
  color: var(--text-muted);
  font-weight: 800;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 201;
  outline: none;
  padding: 10px 2px;
  box-sizing: border-box;
}

[data-theme="dark"] .terminal-toggle-tab {
  background: rgba(15, 23, 42, 0.9);
  color: #94a3b8;
}

/* 🔒 极致优雅的【侧边悬浮拉手】Hover 与点击弹性微动效体系 */
.console-panel.is-collapsed .terminal-toggle-tab:hover {
  transform: translate(-4px, -50%) !important; /* 收起状态下，鼠标 hover 时微微向左滑出 4px 招引用户 */
  color: var(--primary-color, #6366f1);
  background: var(--panel-bg);
  box-shadow: -6px 0 20px rgba(0, 0, 0, 0.12);
}

.console-panel:not(.is-collapsed) .terminal-toggle-tab:hover {
  transform: translate(2px, -50%) !important; /* 展开状态下，鼠标 hover 时微微向右收纳，契合推拉力学 */
  color: var(--primary-color, #6366f1);
  background: var(--panel-bg);
}

.console-panel.is-collapsed .terminal-toggle-tab:active {
  transform: translate(-4px, -50%) scale(0.92) !important; /* 极具物理压缩感的手感点击压缩 */
}

.console-panel:not(.is-collapsed) .terminal-toggle-tab:active {
  transform: translate(2px, -50%) scale(0.92) !important;
}

/* 🖥️ 苹果级高精 Segmented Control 切换器样式 */
.terminal-type-tabs-container {
  display: flex;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
  align-items: center;
}

[data-theme="dark"] .terminal-type-tabs-container {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.03);
}

.type-tab-btn {
  border: none;
  background: transparent;
  padding: 5px 14px;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.type-tab-btn:hover {
  color: var(--text);
}

.type-tab-btn.active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .type-tab-btn.active {
  background: rgba(255, 255, 255, 0.1);
  color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* 全屏放大遮罩下的专用样式 */
.type-tabs-popup {
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}

.type-tabs-popup .type-tab-btn {
  color: #94a3b8 !important;
}

.type-tabs-popup .type-tab-btn:hover {
  color: #f1f5f9 !important;
}

.type-tabs-popup .type-tab-btn.active {
  background: rgba(99, 102, 241, 0.22) !important;
  color: #a5b4fc !important;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.3) !important;
}

/* 全屏调试模式徽章 */
.popup-debug-badge {
  font-size: 0.64rem;
  font-weight: 750;
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
  padding: 2px 8px;
  border-radius: 9999px;
  margin-left: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 极具科技感的激活态 */
.terminal-toggle-tab.active-tab {
  background: linear-gradient(135deg, #4f46e5, #6366f1) !important;
  color: #ffffff !important;
  border-color: #4f46e5 !important;
  box-shadow: -6px 0 20px rgba(99, 102, 241, 0.25) !important;
  font-weight: 900;
}

.terminal-toggle-tab.active-tab:hover {
  background: linear-gradient(135deg, #4f46e5, #6366f1) !important;
  color: #ffffff !important;
}

/* 🔒 极致优雅的【小三角】顺滑旋转与推拉呼吸动画机制 */
.toggle-icon {
  font-size: 0.7rem;
  display: inline-block; /* 必须是 inline-block，transform 旋转与位移才会生效 */
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* 带有微微物理回弹的华丽贝塞尔旋转 */
  transform-origin: center center;
}

/* 展开时：顺时针极其流畅地旋转 180 度，从小三角形 ◀ 优雅蜕变为指向右侧的 ▶ */
.console-panel:not(.is-collapsed) .toggle-icon {
  transform: rotate(180deg);
}

/* X 轴方向呼吸微位移指引动效（增强人机交互暗示） */
@keyframes arrow-push-left {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-3px); }
}

@keyframes arrow-push-right {
  0%, 100% { transform: rotate(180deg) translateX(0); }
  50% { transform: rotate(180deg) translateX(-3px); }
}

.console-panel.is-collapsed .terminal-toggle-tab:hover .toggle-icon {
  animation: arrow-push-left 1.2s ease-in-out infinite;
}

.console-panel:not(.is-collapsed) .terminal-toggle-tab:hover .toggle-icon {
  animation: arrow-push-right 1.2s ease-in-out infinite;
}

.toggle-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1.1;
  color: inherit;
}

.terminal-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.2);
}

[data-theme="dark"] .terminal-header {
  border-bottom-color: rgba(255, 255, 255, 0.05);
  background: rgba(15, 23, 42, 0.2);
}

.terminal-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;
  gap: 8px;
}

.terminal-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.terminal-actions button {
  white-space: nowrap;
}

/* 🧹 清屏按钮：极简深邃蓝 */
.btn-clear-logs {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #3b82f6;
  padding: 4px 10px;
  font-size: 0.68rem;
  font-weight: 750;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

[data-theme="dark"] .btn-clear-logs {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}

.btn-clear-logs:hover {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

.btn-clear-logs:active {
  transform: translateY(0);
}

/* 🔌 断开连接按钮：警示珊瑚红 */
.btn-disconnect-ssh {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
  padding: 4px 10px;
  font-size: 0.68rem;
  font-weight: 750;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

[data-theme="dark"] .btn-disconnect-ssh {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.btn-disconnect-ssh:hover:not(:disabled) {
  background: #ef4444;
  color: #ffffff;
  border-color: #ef4444;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
}

.btn-disconnect-ssh:active:not(:disabled) {
  transform: translateY(0);
}

.btn-disconnect-ssh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.terminal-title {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--text);
}

.log-env-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.log-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.5);
  font-size: 0.72rem;
  font-weight: 750;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .log-tab-btn {
  border-color: rgba(255, 255, 255, 0.06);
  background: rgba(30, 41, 59, 0.4);
}

.log-tab-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  color: var(--text);
  transform: translateY(-1px);
}

[data-theme="dark"] .log-tab-btn:hover {
  background: rgba(30, 41, 59, 0.85);
}

.log-tab-btn.active {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.3);
  color: #6366f1;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.1);
}

[data-theme="dark"] .log-tab-btn.active {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.45);
  color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.log-tab-btn.running-glow {
  border-color: #10b981;
}

[data-theme="dark"] .log-tab-btn.running-glow {
  border-color: #34d399;
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 24px;
  background: #0b0f19; /* 暗色底蕴，契合控制台视感 */
  color: #d1d5db;
  font-family: 'Fira Code', Consolas, Monaco, monospace;
  font-size: 0.76rem;
  line-height: 1.6;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.log-block {
  transition: all 0.15s ease;
}

.block-content {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-block-input {
  color: #38bdf8; /* 天青蓝色高亮 */
  font-weight: 800;
  background: rgba(56, 189, 248, 0.08);
  padding: 6px 12px;
  margin: 6px 0;
  border-radius: 6px;
  border-left: 4px solid #38bdf8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.log-block-error {
  color: #f87171; /* 醒目红 */
  background: rgba(239, 68, 68, 0.08);
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 6px;
  border-left: 4px solid #ef4444;
  font-weight: 700;
}

.log-block-system {
  color: #fbbf24; /* 琥珀橘黄 */
  font-weight: 700;
  background: rgba(251, 191, 36, 0.04);
  padding: 4px 10px;
  border-radius: 4px;
  margin: 2px 0;
}

.log-block-normal {
  color: #5c6b80; /* 前缀淡化为柔和蓝灰，弱化视觉噪音 */
  padding: 2px 0;
}

.log-block-stdout {
  color: #34d399; /* 亮丽的翠绿输出，方便阅读对比 */
  font-weight: 500;
  background: rgba(16, 185, 129, 0.03); /* 🌟 给一整段翠绿代码加上一层极淡的经典背景色，逼格炸裂！ */
  border-radius: 6px;
  padding: 10px 14px;
  border-left: 3px solid rgba(52, 211, 153, 0.4);
  margin: 4px 0;
}


.log-empty {
  color: #64748b;
  font-style: italic;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 🖥️ 高透玻璃态控制流底部样式 */
.terminal-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.25);
  padding: 12px 20px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

[data-theme="dark"] .terminal-footer {
  border-top-color: rgba(255, 255, 255, 0.05);
  background: rgba(15, 23, 42, 0.25);
}

.quick-commands-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.quick-title {
  font-size: 0.72rem;
  font-weight: 850;
  color: var(--text-muted);
  white-space: nowrap;
  margin-top: 6px; /* 💡 顶部微调对齐，当指令多排换行时保持完美顶部平齐对齐 */
}

.quick-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.btn-quick-cmd {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(79, 70, 229, 0.15);
  background: rgba(79, 70, 229, 0.04);
  color: #4f46e5;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

[data-theme="dark"] .btn-quick-cmd {
  border-color: rgba(99, 102, 241, 0.25);
  background: rgba(99, 102, 241, 0.08);
  color: #a5b4fc;
}

.btn-quick-cmd:hover {
  background: #4f46e5;
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.18);
}

[data-theme="dark"] .btn-quick-cmd:hover {
  background: #6366f1;
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);
}

.btn-quick-cmd code {
  font-family: monospace;
  font-size: 0.7rem;
}

.quick-cmd-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  transition: all 0.15s ease;
}

.quick-cmd-del:hover {
  background: #ef4444;
  color: #ffffff;
}

.btn-quick-edit {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px dashed rgba(0, 0, 0, 0.15);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.2s ease;
}

[data-theme="dark"] .btn-quick-edit {
  border-color: rgba(255, 255, 255, 0.15);
}

.btn-quick-edit:hover, .btn-quick-edit.editing-active {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.05);
}

.add-command-bar {
  display: flex;
  gap: 8px;
  width: 100%;
}

.add-cmd-input {
  flex: 1;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.72rem;
  outline: none;
  color: var(--text);
  transition: all 0.2s ease;
}

[data-theme="dark"] .add-cmd-input {
  border-color: rgba(255, 255, 255, 0.06);
  background: rgba(30, 41, 59, 0.4);
}

.add-cmd-input:focus {
  border-color: #4f46e5;
  background: rgba(255, 255, 255, 0.8);
}

[data-theme="dark"] .add-cmd-input:focus {
  background: rgba(30, 41, 59, 0.8);
}

.btn-add-cmd {
  background: #10b981;
  color: #ffffff;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-cmd:hover {
  background: #059669;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
}

.shell-input-container {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  padding: 4px 8px 4px 14px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] .shell-input-container {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.04);
}

.shell-input-container:focus-within {
  border-color: #4f46e5;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 15px rgba(79, 70, 229, 0.08);
}

[data-theme="dark"] .shell-input-container:focus-within {
  border-color: #6366f1;
  background: rgba(15, 23, 42, 0.4);
}

.shell-prompt {
  font-family: monospace;
  font-size: 0.85rem;
  font-weight: 800;
  color: #4f46e5;
}

[data-theme="dark"] .shell-prompt {
  color: #818cf8;
}

.shell-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  color: var(--text);
  font-family: monospace;
  font-size: 0.78rem;
  padding: 6px 0;
}

.shell-input::placeholder {
  font-family: var(--font-family, system-ui);
  font-size: 0.74rem;
  font-weight: 600;
}

.btn-shell-send {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #ffffff;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-shell-send:disabled {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-muted);
  cursor: not-allowed;
}

[data-theme="dark"] .btn-shell-send:disabled {
  background: rgba(255, 255, 255, 0.08);
}

.btn-shell-send:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}

/* ==========================================
   ⚡ 执行目标胶囊切换器极其精美的磨砂质感样式
   ========================================== */
.execution-mode-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0 2px 0;
  padding: 0 2px;
}

.mode-title {
  font-size: 0.7rem;
  font-weight: 850;
  color: var(--text-muted);
  white-space: nowrap;
}

.mode-capsule {
  display: flex;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 2px;
  gap: 2px;
  flex: 1;
}

[data-theme="dark"] .mode-capsule {
  background: rgba(0, 0, 0, 0.25);
  border-color: rgba(255, 255, 255, 0.03);
}

.mode-pill {
  flex: 1;
  border: none;
  background: transparent;
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 750;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  outline: none;
}

.mode-pill:hover {
  color: var(--text);
}

.mode-pill.active {
  background: #ffffff;
  color: #4f46e5;
  font-weight: 850;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] .mode-pill.active {
  background: rgba(30, 41, 59, 0.95);
  color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* ==========================================
   📟 弹窗按钮与大终端全屏放大调试磨砂质感样式
   ========================================== */
.btn-popup-logs {
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #6366f1;
  padding: 4px 10px;
  font-size: 0.68rem;
  font-weight: 750;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

[data-theme="dark"] .btn-popup-logs {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.btn-popup-logs:hover {
  background: #6366f1;
  color: #ffffff;
  border-color: #6366f1;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.btn-open-log-dir {
  background: rgba(100, 116, 139, 0.06);
  border: 1px solid rgba(100, 116, 139, 0.15);
  color: #475569;
  padding: 4px 8px;
  font-size: 0.68rem;
  font-weight: 750;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

[data-theme="dark"] .btn-open-log-dir {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.btn-open-log-dir:hover {
  background: #64748b;
  color: #ffffff;
  border-color: #64748b;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(100, 116, 139, 0.15);
}

[data-theme="dark"] .btn-open-log-dir:hover {
  background: #94a3b8;
  color: #0f172a;
  border-color: #94a3b8;
  box-shadow: 0 4px 12px rgba(148, 163, 184, 0.25);
}

.btn-open-log-dir:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* 🚀 弹窗模式大终端遮罩层 */
.terminal-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 🚀 弹窗模式终端主体 */
.terminal-popup-content {
  width: 90vw;
  height: 85vh;
  background: rgba(11, 15, 25, 0.98) !important;
  backdrop-filter: blur(36px) !important;
  -webkit-backdrop-filter: blur(36px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 16px !important;
  box-shadow: 0 25px 65px rgba(0, 0, 0, 0.65) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

[data-theme="dark"] .terminal-popup-content {
  background: rgba(11, 15, 25, 0.98) !important;
}

@keyframes scaleUp {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* 弹窗专用头部强制暗黑风格 */
.terminal-popup-content .terminal-header {
  background: rgba(15, 23, 42, 0.75) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.terminal-popup-content .terminal-title {
  color: #f1f5f9 !important;
}

/* 弹窗内的分环境切换选项卡强制暗色 */
.terminal-popup-content .log-tab-btn {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  color: #94a3b8 !important;
}

.terminal-popup-content .log-tab-btn:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #f1f5f9 !important;
}

.terminal-popup-content .log-tab-btn.active {
  background: rgba(99, 102, 241, 0.22) !important;
  border-color: rgba(99, 102, 241, 0.5) !important;
  color: #a5b4fc !important;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.3) !important;
}

/* 弹窗专用关闭按钮与大终端内容区 */
.terminal-popup-content .btn-close-popup {
  background: rgba(239, 68, 68, 0.12) !important;
  border: 1px solid rgba(239, 68, 68, 0.3) !important;
  color: #f87171 !important;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 750;
  transition: all 0.2s;
  outline: none;
}

.terminal-popup-content .btn-close-popup:hover {
  background: #ef4444 !important;
  color: #ffffff !important;
  border-color: #ef4444 !important;
}

/* 在弹窗模式下，日志容器强制为极客太空黑底，支持极致滚动 */
.terminal-popup-content .terminal-body {
  flex: 1 !important;
  padding: 24px !important;
  font-size: 0.86rem !important;
  line-height: 1.55 !important;
  background: #0b0f19 !important;
  color: #d1d5db !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
}

/* 弹窗底部操作区强制暗色 */
.terminal-popup-content .terminal-footer {
  background: rgba(15, 23, 42, 0.8) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.terminal-popup-content .quick-title {
  color: #94a3b8 !important;
}

.terminal-popup-content .btn-quick-cmd {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  color: #e2e8f0 !important;
}

.terminal-popup-content .btn-quick-cmd:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #ffffff !important;
}

.terminal-popup-content .btn-quick-edit {
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
  color: #94a3b8 !important;
}

.terminal-popup-content .btn-quick-edit:hover {
  color: #f1f5f9 !important;
}

.terminal-popup-content .shell-input-container {
  background: rgba(0, 0, 0, 0.45) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.terminal-popup-content .shell-input {
  color: #f1f5f9 !important;
}

.terminal-popup-content .shell-input::placeholder {
  color: #475569 !important;
}

/* 大屏终端专用极客黑客风滚动条微交互 */
.terminal-popup-content .terminal-body::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.terminal-popup-content .terminal-body::-webkit-scrollbar-track {
  background: transparent;
}
.terminal-popup-content .terminal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08) !important;
  border-radius: 9999px !important;
}
.terminal-popup-content .terminal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(16, 185, 129, 0.5) !important; /* 荧光翠绿微光 */
}
</style>
