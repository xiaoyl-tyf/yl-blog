<template>
  <div class="post-page">
    <aside class="post-sidebar post-sidebar--left">
      <nav class="post-toc" v-show="tocItems.length > 0">
        <div class="post-toc__title">目录</div>
        <ul class="post-toc__list">
          <li
            v-for="(item, i) in tocItems"
            :key="i"
            :class="[
              'post-toc__item',
              'post-toc__item--' + item.level,
              { 'post-toc__item--active': activeTocIndex === i }
            ]"
          >
            <a :href="'#' + item.id" @click.prevent="scrollToHeading(item.id, i)">
              {{ item.text }}
            </a>
          </li>
        </ul>
      </nav>
    </aside>

    <div class="post-detail">
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="empty-state">
        <div class="empty-state__icon">!</div>
        <p>{{ error }}</p>
      </div>
      <template v-else-if="post">
        <div class="post-detail__header">
          <h1 class="post-detail__title">{{ post.title }}</h1>
          <div class="post-detail__date">
            {{ formatDate(post.created_at) }}
            <span v-if="post.updated_at !== post.created_at"> · 更新于 {{ formatDate(post.updated_at) }}</span>
          </div>
          <div v-if="post.tags && post.tags.length" class="post-detail__tags">
            <router-link
              v-for="tag in post.tags"
              :key="tag"
              :to="{ name: 'TagPosts', params: { tag } }"
              class="tag"
            >
              {{ tag }}
            </router-link>
          </div>
        </div>
        <div class="post-detail__content" ref="contentRef" v-html="renderedContent"></div>
      </template>
    </div>

    <aside class="post-sidebar post-sidebar--right"></aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { marked, Renderer } from 'marked'
import { api } from '@/api'

const route = useRoute()
const post = ref(null)
const loading = ref(true)
const error = ref('')
const contentRef = ref(null)
const tocItems = ref([])
const activeTocIndex = ref(-1)

const headingSlugs = {}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[<>]/g, '')
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
    || 'heading'
}

// Custom renderer: add IDs to headings for TOC anchors
const customRenderer = new Renderer()
customRenderer.heading = function({ text, depth }) {
  const cleanText = text.replace(/<[^>]*>/g, '')
  let slug = slugify(cleanText)
  if (headingSlugs[slug]) {
    let count = 1
    while (headingSlugs[slug + '-' + count]) count++
    slug = slug + '-' + count
  }
  headingSlugs[slug] = true
  return `<h${depth} id="${slug}">${text}</h${depth}>\n`
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const renderedContent = computed(() => {
  if (!post.value) return ''
  return marked(post.value.content, { renderer: customRenderer, breaks: true })
})

function extractTOC() {
  nextTick(() => {
    nextTick(() => {
      if (!contentRef.value) return
      const headings = contentRef.value.querySelectorAll('h2, h3, h4')
      tocItems.value = Array.from(headings).map((h) => ({
        id: h.id || '',
        text: h.textContent || '',
        level: h.tagName.toLowerCase()
      }))
    })
  })
}

function scrollToHeading(id, index) {
  activeTocIndex.value = index
  const el = document.getElementById(id)
  if (el) {
    const offset = 80
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
  }
}

function handleScroll() {
  if (!contentRef.value) return
  const headings = contentRef.value.querySelectorAll('h2, h3, h4')
  let current = -1
  const scrollPos = window.scrollY + 120
  headings.forEach((h, i) => {
    if (h.getBoundingClientRect().top + window.scrollY <= scrollPos) {
      current = i
    }
  })
  activeTocIndex.value = current
}

onMounted(async () => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  try {
    post.value = await api.getPostBySlug(route.params.slug)
    await nextTick()
    extractTOC()
  } catch (e) {
    error.value = '文章不存在或已被删除'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

watch(() => route.params.slug, async (newSlug) => {
  if (!newSlug) return
  loading.value = true
  error.value = ''
  post.value = null
  tocItems.value = []
  activeTocIndex.value = -1
  try {
    post.value = await api.getPostBySlug(newSlug)
    await nextTick()
    extractTOC()
  } catch (e) {
    error.value = '文章不存在或已被删除'
  } finally {
    loading.value = false
  }
})
</script>
