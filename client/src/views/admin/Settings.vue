<template>
  <div>
    <header class="admin-header">
      <router-link to="/" class="admin-header__title">YL 管理后台</router-link>
      <nav class="admin-header__nav">
        <router-link :to="{ name: 'AdminPosts' }">文章</router-link>
        <router-link :to="{ name: 'AdminSettings' }">设置</router-link>
        <a href="#" @click.prevent="handleLogout">退出</a>
      </nav>
    </header>
    <main class="admin-main">
      <h1 style="font-family: var(--font-display); font-size: 1.5rem; margin-bottom: var(--space-xl);">站点设置</h1>

      <div v-if="success" class="alert alert--success">{{ success }}</div>

      <div class="form-group">
        <label class="form-label">站点标题</label>
        <input v-model="siteTitle" type="text" class="form-input" placeholder="例如：YL" />
      </div>

      <div class="form-group">
        <label class="form-label">站点副标题</label>
        <input v-model="siteSubtitle" type="text" class="form-input" placeholder="例如：记录思考，分享见闻" />
      </div>

      <div class="form-group">
        <label class="form-label">关于页面内容（Markdown）</label>
        <textarea v-model="aboutContent" class="form-textarea" rows="10" placeholder="写一段关于你自己的介绍..."></textarea>
      </div>

      <div class="form-group" v-if="aboutContent">
        <label class="form-label">关于页面预览</label>
        <div class="editor-preview">
          <div class="about-content" v-html="renderedAbout"></div>
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button class="btn btn--primary" @click="handleSave" :disabled="saving">
          <span v-if="saving" class="loading-spinner"></span>
          保存设置
        </button>
      </div>

      <hr style="margin: var(--space-xl) 0; border: none; border-top: 1px solid var(--color-border);" />

      <h2 style="font-family: var(--font-display); font-size: 1.2rem; margin-bottom: var(--space-md);">AI 聊天配置</h2>

      <div class="form-group">
        <label class="form-label" style="display: flex; align-items: center; gap: 8px;">
          启用 AI 聊天
          <span style="font-weight: 400; color: var(--color-text-muted); font-size: 0.78rem;">（在首页右侧显示聊天窗口）</span>
        </label>
        <label class="toggle">
          <input type="checkbox" v-model="aiEnabled" true-value="true" false-value="false" />
          <span class="toggle__slider"></span>
        </label>
      </div>

      <div class="form-group">
        <label class="form-label">Anthropic API Key</label>
        <input v-model="aiApiKey" type="password" class="form-input" placeholder="sk-ant-..." />
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
          API Key 仅在服务端使用，不会暴露给前端。
        </p>
      </div>

      <div class="form-group">
        <label class="form-label">模型</label>
        <select v-model="aiModel" class="form-select">
          <option value="claude-opus-4-8">Claude Opus 4.8（推荐）</option>
          <option value="claude-sonnet-5">Claude Sonnet 5</option>
          <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">系统提示词</label>
        <textarea v-model="aiSystemPrompt" class="form-textarea" rows="4" placeholder="自定义 AI 助手的行为..."></textarea>
        <p style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px;">
          系统提示词会与博客文章列表合并后发送给 AI 模型。
        </p>
      </div>

      <hr style="margin: var(--space-xl) 0; border: none; border-top: 1px solid var(--color-border);" />

      <h2 style="font-family: var(--font-display); font-size: 1.2rem; margin-bottom: var(--space-md);">修改密码</h2>

      <form @submit.prevent="handleChangePassword">
        <div class="form-group">
          <label class="form-label">原密码</label>
          <input v-model="oldPassword" type="password" class="form-input" required />
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <input v-model="newPassword" type="password" class="form-input" required minlength="6" />
        </div>
        <button type="submit" class="btn" :disabled="changingPw">
          <span v-if="changingPw" class="loading-spinner"></span>
          修改密码
        </button>
        <p v-if="pwError" style="color: var(--color-error); margin-top: 8px; font-size: 0.85rem;">{{ pwError }}</p>
        <p v-if="pwSuccess" style="color: var(--color-success); margin-top: 8px; font-size: 0.85rem;">{{ pwSuccess }}</p>
      </form>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import { api } from '@/api'

const router = useRouter()
const siteTitle = ref('')
const siteSubtitle = ref('')
const aboutContent = ref('')
const success = ref('')
const saving = ref(false)

const oldPassword = ref('')
const newPassword = ref('')
const changingPw = ref(false)
const pwError = ref('')
const pwSuccess = ref('')

const aiEnabled = ref('false')
const aiApiKey = ref('')
const aiModel = ref('claude-opus-4-8')
const aiSystemPrompt = ref('')

const renderedAbout = computed(() => {
  if (!aboutContent.value) return ''
  return marked(aboutContent.value, { breaks: true })
})

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push({ name: 'AdminLogin' })
}

async function handleSave() {
  saving.value = true
  success.value = ''
  try {
    await api.updateSetting('site_title', siteTitle.value)
    await api.updateSetting('site_subtitle', siteSubtitle.value)
    await api.updateSetting('about_content', aboutContent.value)
    await api.updateSetting('ai_enabled', aiEnabled.value)
    await api.updateSetting('ai_api_key', aiApiKey.value)
    await api.updateSetting('ai_model', aiModel.value)
    await api.updateSetting('ai_system_prompt', aiSystemPrompt.value)
    success.value = '设置已保存！'
  } catch (e) {
    alert(e.message)
  } finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  pwError.value = ''
  pwSuccess.value = ''
  changingPw.value = true
  try {
    await api.changePassword(oldPassword.value, newPassword.value)
    pwSuccess.value = '密码修改成功！'
    oldPassword.value = ''
    newPassword.value = ''
  } catch (e) {
    pwError.value = e.message || '修改失败'
  } finally {
    changingPw.value = false
  }
}

onMounted(async () => {
  try {
    const settings = await api.getSettings()
    siteTitle.value = settings.site_title || ''
    siteSubtitle.value = settings.site_subtitle || ''
    aboutContent.value = settings.about_content || ''
    aiEnabled.value = settings.ai_enabled || 'false'
    aiApiKey.value = settings.ai_api_key || ''
    aiModel.value = settings.ai_model || 'claude-opus-4-8'
    aiSystemPrompt.value = settings.ai_system_prompt || ''
  } catch {}
})
</script>
