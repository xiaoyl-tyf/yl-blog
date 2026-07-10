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
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <h1 style="font-family: var(--font-display); font-size: 1.5rem;">
          {{ isEdit ? '编辑文章' : '写新文章' }}
        </h1>
        <div style="display: flex; gap: 8px;">
          <button class="btn" @click="handleSave(false)" :disabled="saving">
            <span v-if="saving && !publishing" class="loading-spinner"></span>
            保存草稿
          </button>
          <button class="btn btn--primary" @click="handleSave(true)" :disabled="saving">
            <span v-if="saving && publishing" class="loading-spinner"></span>
            发布
          </button>
        </div>
      </div>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="success" class="alert alert--success">{{ success }}</div>

      <form @submit.prevent="handleSave(true)">
        <div class="form-group">
          <label class="form-label">标题</label>
          <input v-model="form.title" type="text" class="form-input" placeholder="文章标题" required />
        </div>

        <div class="form-group">
          <label class="form-label">摘要</label>
          <input v-model="form.excerpt" type="text" class="form-input" placeholder="文章摘要（可选）" />
        </div>

        <div class="form-group">
          <label class="form-label">标签（逗号分隔）</label>
          <input v-model="tagsStr" type="text" class="form-input" placeholder="Vue, 前端技术, JavaScript" />
        </div>

        <div class="form-group">
          <label class="form-label">正文（Markdown）</label>
          <div class="editor-toolbar">
            <button type="button" @click="insertMarkdown('**', '**')" title="粗体">B</button>
            <button type="button" @click="insertMarkdown('*', '*')" title="斜体">I</button>
            <button type="button" @click="insertMarkdown('## ', '')" title="标题">H</button>
            <button type="button" @click="insertMarkdown('[链接文本](', ')')" title="链接">🔗</button>
            <button type="button" @click="insertMarkdown('![图片描述](', ')')" title="图片">🖼</button>
            <button type="button" @click="insertMarkdown('```\n', '\n```')" title="代码块">&lt;/&gt;</button>
            <button type="button" @click="insertMarkdown('> ', '')" title="引用">❝</button>
            <button type="button" @click="insertMarkdown('- ', '')" title="列表">•</button>
            <button type="button" @click="insertMarkdown('---\n', '')" title="分割线">—</button>
          </div>
          <textarea
            ref="editorRef"
            v-model="form.content"
            class="editor-textarea"
            placeholder="开始写文章..."
          ></textarea>
        </div>

        <div class="form-group" v-if="form.content">
          <label class="form-label">预览</label>
          <div class="editor-preview">
            <div class="post-detail__content" v-html="renderedPreview"></div>
          </div>
        </div>
      </form>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import { api } from '@/api'

const route = useRoute()
const router = useRouter()
const editorRef = ref(null)
const isEdit = computed(() => !!route.params.id)
const saving = ref(false)
const publishing = ref(false)
const error = ref('')
const success = ref('')

const form = ref({
  title: '',
  excerpt: '',
  content: '',
  tags: [],
  published: false
})

const tagsStr = computed({
  get: () => form.value.tags.join(', '),
  set: (val) => {
    form.value.tags = val.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  }
})

const renderedPreview = computed(() => {
  if (!form.value.content) return ''
  return marked(form.value.content, { breaks: true })
})

function insertMarkdown(before, after) {
  const textarea = editorRef.value
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = form.value.content.substring(start, end)
  const newText = before + selected + after

  form.value.content =
    form.value.content.substring(0, start) + newText + form.value.content.substring(end)

  nextTick(() => {
    textarea.focus()
    textarea.selectionStart = start + before.length
    textarea.selectionEnd = start + before.length + selected.length
  })
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push({ name: 'AdminLogin' })
}

async function handleSave(publish) {
  saving.value = true
  publishing.value = publish
  error.value = ''
  success.value = ''

  try {
    if (isEdit.value) {
      await api.updatePost(route.params.id, { ...form.value, published: publish })
      success.value = publish ? '文章已发布！' : '草稿已保存！'
    } else {
      const data = await api.createPost({ ...form.value, published: publish })
      router.replace({ name: 'AdminPostEdit', params: { id: data.id } })
      success.value = publish ? '文章已发布！' : '草稿已保存！'
    }
  } catch (e) {
    error.value = e.message || '保存失败'
  } finally {
    saving.value = false
    publishing.value = false
  }
}

onMounted(async () => {
  if (isEdit.value) {
    try {
      const data = await api.getPost(route.params.id)
      form.value = {
        title: data.title,
        excerpt: data.excerpt || '',
        content: data.content,
        tags: data.tags || [],
        published: !!data.published
      }
    } catch (e) {
      error.value = '加载文章失败'
    }
  }
})
</script>
