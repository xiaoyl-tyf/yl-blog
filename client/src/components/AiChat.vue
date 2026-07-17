<template>
  <aside v-if="enabled" class="ai-chat">
    <div class="ai-chat__header">
      <h3 class="ai-chat__title">AI 助手</h3>
      <button
        class="ai-chat__toggle"
        @click="collapsed = !collapsed"
        :aria-label="collapsed ? '展开' : '收起'"
      >
        {{ collapsed ? '+' : '−' }}
      </button>
    </div>

    <div v-show="!collapsed" class="ai-chat__body">
      <!-- Empty state -->
      <div v-if="messages.length === 0 && !loading && !error" class="ai-chat__empty">
        <p>有什么关于博客的问题？可以问我。</p>
        <div class="ai-chat__suggestions">
          <button
            v-for="q in suggestedQuestions"
            :key="q"
            class="ai-chat__suggestion-btn"
            @click="sendMessage(q)"
          >
            {{ q }}
          </button>
        </div>
      </div>

      <!-- Messages + Loading (always visible when not empty, to avoid DOM toggle) -->
      <div v-show="messages.length > 0 || loading || error" class="ai-chat__messages" ref="messagesRef">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['ai-chat__message', 'ai-chat__message--' + msg.role]"
        >
          <div
            v-if="msg.role === 'assistant'"
            class="ai-chat__message-text ai-chat__message-text--md"
            v-text="msg.content"
          ></div>
          <div v-else class="ai-chat__message-text" v-text="msg.content"></div>
        </div>

        <!-- Loading indicator -->
        <div v-if="loading" class="ai-chat__loading">
          <span class="ai-chat__dot"></span>
          <span class="ai-chat__dot"></span>
          <span class="ai-chat__dot"></span>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="ai-chat__error">
        <p>{{ error }}</p>
        <button v-if="isRetryable" @click="retry" class="ai-chat__retry-btn">重试</button>
      </div>

      <!-- Input -->
      <form
        v-if="!error || isRetryable"
        class="ai-chat__input-row"
        @submit.prevent="handleSend"
      >
        <input
          v-model="input"
          type="text"
          class="ai-chat__input"
          placeholder="输入问题..."
          :disabled="loading"
          maxlength="500"
        />
        <button
          type="submit"
          class="ai-chat__send-btn"
          :disabled="!input.trim() || loading"
        >
          发送
        </button>
      </form>
    </div>
  </aside>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import { api } from '@/api'

const enabled = ref(false)
const collapsed = ref(false)
const messages = ref([])
const input = ref('')
const loading = ref(false)
const error = ref('')
const isRetryable = ref(false)
const messagesRef = ref(null)

const suggestedQuestions = [
  '这个博客主要写什么内容？',
  '有哪些文章推荐阅读？',
  '最近更新了哪些文章？'
]

const MAX_HISTORY = 20

// ---- session persistence ----
const SESSION_KEY = 'ai_chat_session_id'
function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}
const sessionId = getSessionId()

async function loadHistory() {
  try {
    const res = await fetch('/api/chat/history', {
      headers: { 'X-Session-Id': sessionId }
    })
    if (res.ok) {
      const data = await res.json()
      messages.value = data.messages.map(m => ({ role: m.role, content: m.content }))
      await nextTick()
      scrollToBottom()
    }
  } catch {
    // Best-effort — chat works fine without history
  }
}

async function saveMessages(msgs) {
  try {
    await fetch('/api/chat/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ messages: msgs })
    })
  } catch {
    // Silent fail — persistence is best-effort
  }
}

function renderMarkdown(text) {
  if (!text) return ''
  return marked(text, { breaks: true })
}

onMounted(async () => {
  try {
    const settings = await api.getSettings()
    enabled.value = settings.ai_enabled === 'true'
    if (enabled.value) {
      await loadHistory()
    }
  } catch {
    enabled.value = false
  }
})

async function handleSend() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  error.value = ''
  isRetryable.value = false
  loading.value = true

  await nextTick()
  scrollToBottom()

  // ---- typing animation state ----
  let fullText = ''        // collected deltas (hidden buffer)
  let streamDone = false   // true when SSE stream ends
  let animId = null
  const CPS = 80           // chars-per-second for typing effect

  // Push assistant placeholder — access through reactive array so property assignment triggers Vue re-render
  const msgIdx = messages.value.push({ role: 'assistant', content: '' }) - 1

  const chatHistory = messages.value.slice(-MAX_HISTORY - 2, -2)

  function startTyping() {
    const t0 = performance.now()
    function tick() {
      // Access through reactive array so property assignment triggers Vue re-render
      const msg = messages.value[msgIdx]
      const elapsed = performance.now() - t0
      const targetLen = Math.min(
        Math.floor((elapsed / 1000) * CPS),
        fullText.length
      )
      if (targetLen > msg.content.length) {
        msg.content = fullText.slice(0, targetLen)
        scrollToBottom()
      }
      if (msg.content.length < fullText.length || !streamDone) {
        animId = requestAnimationFrame(tick)
      } else {
        animId = null
        loading.value = false
        scrollToBottom()
        // Persist user+assistant exchange
        const userMsg = messages.value[msgIdx - 1]
        const astMsg = messages.value[msgIdx]
        if (userMsg && astMsg && astMsg.content) {
          saveMessages([
            { role: userMsg.role, content: userMsg.content },
            { role: astMsg.role, content: astMsg.content }
          ])
        }
      }
    }
    animId = requestAnimationFrame(tick)
  }

  try {
    const token = localStorage.getItem('token')
    const reqHeaders = { 'Content-Type': 'application/json' }
    if (token) reqHeaders['Authorization'] = `Bearer ${token}`

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify({ message: text, history: chatHistory, stream: true })
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }))
      throw new Error(err.error || '请求失败')
    }

    // Start typing animation BEFORE reading — so first chars appear while stream arrives
    startTyping()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''

      for (const line of lines) {
        const s = line.trim()
        if (!s.startsWith('data: ')) continue
        try {
          const e = JSON.parse(s.slice(6))
          if (e.type === 'delta') {
            fullText += e.content   // collect into buffer, animation reads from it
          } else if (e.type === 'error') {
            throw new Error(e.error)
          }
        } catch (ex) {
          if (!(ex instanceof SyntaxError)) throw ex
        }
      }
    }

    streamDone = true   // signal animation: no more data coming
  } catch (e) {
    if (animId) cancelAnimationFrame(animId)
    const msg = messages.value[msgIdx]
    if (msg && !msg.content) {
      messages.value.splice(msgIdx, 1)
    }
    error.value = e.message || 'AI 回复失败，请稍后重试'
    isRetryable.value = true
    loading.value = false
  }
}

function sendMessage(text) {
  input.value = text
  handleSend()
}

function retry() {
  // Remove everything from the last user message onward (including partial streaming response)
  const lastUserIdx = [...messages.value].reverse().findIndex(m => m.role === 'user')
  if (lastUserIdx !== -1) {
    const realIdx = messages.value.length - 1 - lastUserIdx
    const lastUserMsg = messages.value[realIdx]
    messages.value.splice(realIdx)
    input.value = lastUserMsg.content
  }
  error.value = ''
  isRetryable.value = false
  handleSend()
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}
</script>
