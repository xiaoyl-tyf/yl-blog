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

      <!-- Messages -->
      <div v-else class="ai-chat__messages" ref="messagesRef">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['ai-chat__message', 'ai-chat__message--' + msg.role]"
        >
          <div
            v-if="msg.role === 'assistant'"
            class="ai-chat__message-text ai-chat__message-text--md"
            v-html="renderMarkdown(msg.content)"
          ></div>
          <div v-else class="ai-chat__message-text">{{ msg.content }}</div>
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

function renderMarkdown(text) {
  if (!text) return ''
  return marked(text, { breaks: true })
}

onMounted(async () => {
  try {
    const settings = await api.getSettings()
    enabled.value = settings.ai_enabled === 'true'
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

  try {
    const history = messages.value.slice(-MAX_HISTORY - 1, -1)
    const data = await api.chat(text, history)
    messages.value.push({ role: 'assistant', content: data.reply })
  } catch (e) {
    error.value = e.message || 'AI 回复失败，请稍后重试'
    isRetryable.value = true
  } finally {
    loading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function sendMessage(text) {
  input.value = text
  handleSend()
}

function retry() {
  if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'user') {
    const lastUserMsg = messages.value.pop()
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
