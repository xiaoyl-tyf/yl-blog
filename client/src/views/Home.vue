<template>
  <div>
    <section class="hero">
      <div class="container container--narrow">
        <h1 class="hero__title">
          你好，我是<span class="accent"> {{ settings.site_title || 'YL' }}</span>
        </h1>
        <p class="hero__subtitle">{{ settings.site_subtitle || '记录思考，分享见闻' }}</p>
        <div class="hero__divider"></div>
      </div>
    </section>

    <section class="container container--narrow">
      <!-- Tags -->
      <div v-if="tags.length" class="tag-list">
        <router-link
          v-for="t in tags"
          :key="t.name"
          :to="{ name: 'TagPosts', params: { tag: t.name } }"
          class="tag"
        >
          {{ t.name }} ({{ t.count }})
        </router-link>
      </div>

      <!-- Posts -->
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="empty-state">
        <div class="empty-state__icon">!</div>
        <p>{{ error }}</p>
      </div>
      <template v-else>
        <div class="post-grid">
          <article
            v-for="post in posts"
            :key="post.id"
            class="post-card"
            @click="$router.push({ name: 'PostDetail', params: { slug: post.slug } })"
          >
            <div class="post-card__meta">
              <span>{{ formatDate(post.created_at) }}</span>
            </div>
            <h2 class="post-card__title">
              <router-link :to="{ name: 'PostDetail', params: { slug: post.slug } }">
                {{ post.title }}
              </router-link>
            </h2>
            <p class="post-card__excerpt">{{ post.excerpt }}</p>
            <div class="post-card__tags">
              <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </article>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pagination">
          <button
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
          >
            上一页
          </button>
          <button
            v-for="p in totalPages"
            :key="p"
            :class="{ active: p === currentPage }"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>
          <button
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/api'

const settings = ref({})
const posts = ref([])
const tags = ref([])
const currentPage = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

async function loadPosts() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.getPublishedPosts(currentPage.value)
    posts.value = data.posts
    totalPages.value = data.totalPages
  } catch (e) {
    error.value = '加载文章失败'
  } finally {
    loading.value = false
  }
}

function goToPage(page) {
  currentPage.value = page
  loadPosts()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(async () => {
  try {
    settings.value = await api.getSettings()
  } catch {}
  try {
    tags.value = await api.getTags()
  } catch {}
  await loadPosts()
})
</script>
