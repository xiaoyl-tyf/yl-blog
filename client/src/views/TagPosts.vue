<template>
  <div class="page-section">
    <div class="container container--narrow">
      <h1 class="page-title"># {{ tag }}</h1>
      <p class="page-subtitle">共 {{ total }} 篇文章</p>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="!posts.length" class="empty-state">
        <div class="empty-state__icon">~</div>
        <p>该标签下暂无文章</p>
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
              <span v-for="t in post.tags" :key="t" class="tag">{{ t }}</span>
            </div>
          </article>
        </div>

        <div v-if="totalPages > 1" class="pagination">
          <button :disabled="page <= 1" @click="goToPage(page - 1)">上一页</button>
          <button v-for="p in totalPages" :key="p" :class="{ active: p === page }" @click="goToPage(p)">{{ p }}</button>
          <button :disabled="page >= totalPages" @click="goToPage(page + 1)">下一页</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'

const route = useRoute()
const posts = ref([])
const tag = ref('')
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
const loading = ref(true)

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

async function loadPosts() {
  loading.value = true
  tag.value = route.params.tag
  try {
    const data = await api.getPublishedPosts(page.value, tag.value)
    posts.value = data.posts
    total.value = data.total
    totalPages.value = data.totalPages
  } catch {} finally {
    loading.value = false
  }
}

function goToPage(p) {
  page.value = p
  loadPosts()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

watch(() => route.params.tag, () => {
  page.value = 1
  loadPosts()
})

onMounted(loadPosts)
</script>
