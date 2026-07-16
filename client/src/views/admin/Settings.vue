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
    <div class="admin-settings-layout">
      <!-- Sidebar TOC -->
      <aside class="admin-settings-sidebar">
        <nav class="admin-settings-nav">
          <a
            v-for="s in sections"
            :key="s.id"
            :class="['admin-settings-nav__item', { 'admin-settings-nav__item--active': activeSection === s.id }]"
            :href="'#' + s.id"
            @click.prevent="scrollToSection(s.id)"
          >{{ s.label }}</a>
        </nav>
      </aside>

      <!-- Main content -->
      <div class="admin-settings-content" ref="contentRef">
        <div v-if="success" class="alert alert--success">{{ success }}</div>

        <!-- Section: Site -->
        <section id="sec-site" class="admin-section">
          <div class="admin-section__header">
            <h2 class="admin-section__title">站点信息</h2>
            <p class="admin-section__desc">设置博客的基本信息和对外展示内容</p>
          </div>
          <div class="admin-section__body">
            <div class="form-group">
              <label class="form-label">站点标题</label>
              <input v-model="siteTitle" type="text" class="form-input" placeholder="例如：YL" />
            </div>
            <div class="form-group">
              <label class="form-label">站点副标题</label>
              <input v-model="siteSubtitle" type="text" class="form-input" placeholder="例如：记录思考，分享见闻" />
            </div>
            <div class="form-group">
              <label class="form-label">关于页面内容 <span class="form-label__hint">（Markdown）</span></label>
              <textarea v-model="aboutContent" class="form-textarea" rows="8" placeholder="写一段关于你自己的介绍..."></textarea>
            </div>
            <div class="form-group" v-if="aboutContent">
              <label class="form-label">预览</label>
              <div class="editor-preview">
                <div class="about-content" v-html="renderedAbout"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section: AI Chat -->
        <section id="sec-ai" class="admin-section">
          <div class="admin-section__header">
            <h2 class="admin-section__title">AI 聊天</h2>
            <p class="admin-section__desc">配置首页 AI 聊天助手的行为与模型参数</p>
          </div>
          <div class="admin-section__body">
            <div class="form-group">
              <label class="form-label">启用状态</label>
              <div class="form-inline">
                <label class="toggle">
                  <input type="checkbox" v-model="aiEnabled" true-value="true" false-value="false" />
                  <span class="toggle__slider"></span>
                </label>
                <span class="form-inline__label">{{ aiEnabled === 'true' ? '已开启 — 首页右侧显示聊天窗口' : '已关闭 — 不在首页显示聊天窗口' }}</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">API 服务商</label>
              <select v-model="aiProvider" class="form-select" style="max-width:320px">
                <option value="anthropic">Anthropic（Claude）</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">API Key</label>
              <input v-model="aiApiKey" type="password" class="form-input" :placeholder="aiProvider === 'anthropic' ? 'sk-ant-api03-...' : 'sk-...'" style="max-width:480px" />
              <p class="form-hint">API Key 仅在服务端使用，不会暴露给前端</p>
            </div>

            <div class="form-group">
              <label class="form-label">模型</label>
              <select v-model="aiModel" class="form-select" style="max-width:320px">
                <template v-if="aiProvider === 'anthropic'">
                  <option value="claude-opus-4-8">Claude Opus 4.8 — 最强推理</option>
                  <option value="claude-sonnet-5">Claude Sonnet 5 — 性价比推荐</option>
                  <option value="claude-haiku-4-5">Claude Haiku 4.5 — 轻量快速</option>
                </template>
                <template v-else>
                  <option value="deepseek-v4-flash">DeepSeek V4 Flash — 高性价比</option>
                  <option value="deepseek-v4-pro">DeepSeek V4 Pro — 强推理</option>
                </template>
              </select>
              <p class="form-hint">选择 {{ aiProvider === 'anthropic' ? 'Anthropic' : 'DeepSeek' }} 的模型。模型能力越强，回复质量越高，但成本也越高</p>
            </div>

            <div class="form-group">
              <label class="form-label">系统提示词</label>
              <textarea v-model="aiSystemPrompt" class="form-textarea" rows="5" placeholder="自定义 AI 助手的行为..."></textarea>
              <p class="form-hint">系统提示词定义了 AI 的角色和行为方式，会与博客文章列表合并后一起发送给模型</p>
            </div>

            <!-- RAG 语义搜索 -->
            <div class="form-group" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color)">
              <label class="form-label">RAG 语义搜索</label>
              <div class="form-inline" style="margin-bottom: 0.75rem">
                <label class="toggle">
                  <input type="checkbox" v-model="aiRagEnabled" true-value="true" false-value="false" />
                  <span class="toggle__slider"></span>
                </label>
                <span class="form-inline__label">
                  {{ aiRagEnabled === 'true' ? '已开启 — 根据访客问题智能检索相关文章（本地模型，无需 API）' : '已关闭 — 将全部文章摘要发给 AI' }}
                </span>
              </div>

              <div v-if="aiRagEnabled === 'true'">
                <div class="form-group">
                  <label class="form-label">检索文章数量</label>
                  <select v-model="aiRagTopK" class="form-select" style="max-width:200px">
                    <option value="1">1 篇</option>
                    <option value="3">3 篇（推荐）</option>
                    <option value="5">5 篇</option>
                  </select>
                  <p class="form-hint">每次检索多少篇最相关的文章内容发给 AI。越多 token 消耗越大</p>
                </div>

                <div class="form-group">
                  <label class="form-label">单篇文章最大内容长度</label>
                  <input v-model="aiRagMaxContentLen" type="number" class="form-input" style="max-width:160px" min="500" max="8000" step="100" />
                  <span class="form-hint" style="margin-left:0.5rem">字符（500-8000，默认 2000）</span>
                  <p class="form-hint">发送给 AI 的单篇文章内容上限，超出部分会截断并标注</p>
                </div>

                <div class="form-group">
                  <button class="btn" @click="handleRebuildEmbeddings" :disabled="rebuilding">
                    <span v-if="rebuilding" class="loading-spinner"></span>
                    重建所有文章的嵌入向量
                  </button>
                  <p v-if="rebuildResult" class="form-feedback" :class="rebuildResult.success > 0 ? 'form-feedback--success' : 'form-feedback--error'">
                    {{ rebuildResult.success > 0 ? `成功重建 ${rebuildResult.success} 篇文章的嵌入向量` : '重建失败，请检查 API 配置' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section: Password -->
        <section id="sec-password" class="admin-section">
          <div class="admin-section__header">
            <h2 class="admin-section__title">账户安全</h2>
            <p class="admin-section__desc">修改管理员登录密码</p>
          </div>
          <div class="admin-section__body">
            <form @submit.prevent="handleChangePassword">
              <div class="form-group">
                <label class="form-label">当前密码</label>
                <input v-model="oldPassword" type="password" class="form-input" style="max-width:320px" required />
              </div>
              <div class="form-group">
                <label class="form-label">新密码</label>
                <input v-model="newPassword" type="password" class="form-input" style="max-width:320px" required minlength="6" placeholder="至少 6 位" />
              </div>
              <button type="submit" class="btn" :disabled="changingPw">
                <span v-if="changingPw" class="loading-spinner"></span>
                修改密码
              </button>
              <p v-if="pwError" class="form-feedback form-feedback--error">{{ pwError }}</p>
              <p v-if="pwSuccess" class="form-feedback form-feedback--success">{{ pwSuccess }}</p>
            </form>
          </div>
        </section>

        <!-- Save bar -->
        <div class="admin-save-bar">
          <button class="btn btn--primary btn--lg" @click="handleSave" :disabled="saving">
            <span v-if="saving" class="loading-spinner"></span>
            保存所有设置
          </button>
          <span v-if="success" class="admin-save-bar__msg">{{ success }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
const aiProvider = ref('anthropic')
const aiApiKey = ref('')
const aiModel = ref('claude-opus-4-8')
const aiSystemPrompt = ref('')
const aiRagEnabled = ref('false')
const aiRagTopK = ref('3')
const aiRagMaxContentLen = ref('2000')
const rebuilding = ref(false)
const rebuildResult = ref(null)

const activeSection = ref('sec-site')
const contentRef = ref(null)

const sections = [
  { id: 'sec-site', label: '站点信息' },
  { id: 'sec-ai', label: 'AI 聊天' },
  { id: 'sec-password', label: '账户安全' }
]

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
    await api.updateSetting('ai_rag_enabled', aiRagEnabled.value)
    await api.updateSetting('ai_rag_top_k', aiRagTopK.value)
    await api.updateSetting('ai_rag_max_content_length', aiRagMaxContentLen.value)
    success.value = '所有设置已保存'
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
    pwSuccess.value = '密码修改成功'
    oldPassword.value = ''
    newPassword.value = ''
  } catch (e) {
    pwError.value = e.message || '修改失败'
  } finally {
    changingPw.value = false
  }
}

function scrollToSection(id) {
  activeSection.value = id
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

async function handleRebuildEmbeddings() {
  rebuilding.value = true
  rebuildResult.value = null
  try {
    rebuildResult.value = await api.rebuildEmbeddings()
  } catch (e) {
    rebuildResult.value = { success: 0, failed: 1, error: e.message }
  } finally {
    rebuilding.value = false
  }
}

function onScroll() {
  if (!contentRef.value) return
  const sections_ = contentRef.value.querySelectorAll('.admin-section')
  const scrollTop = contentRef.value.scrollTop + 20
  for (const s of sections_) {
    if (s.offsetTop <= scrollTop) {
      activeSection.value = s.id
    }
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
    aiRagEnabled.value = settings.ai_rag_enabled || 'false'
    aiRagTopK.value = settings.ai_rag_top_k || '3'
    aiRagMaxContentLen.value = settings.ai_rag_max_content_length || '2000'
    // Detect provider from model
    aiProvider.value = (settings.ai_model || '').startsWith('deepseek') ? 'deepseek' : 'anthropic'
  } catch {}
  if (contentRef.value) {
    contentRef.value.addEventListener('scroll', onScroll, { passive: true })
  }
})

onUnmounted(() => {
  if (contentRef.value) {
    contentRef.value.removeEventListener('scroll', onScroll)
  }
})
</script>
