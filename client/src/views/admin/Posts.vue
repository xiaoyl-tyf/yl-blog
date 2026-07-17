<template>
  <div>
    <AdminHeader />
    <main class="admin-main">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <h1 style="font-family: var(--font-display); font-size: 1.5rem;">文章管理</h1>
        <router-link :to="{ name: 'AdminPostEdit' }" class="btn btn--primary">写新文章</router-link>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="!posts.length" class="empty-state">
        <div class="empty-state__icon">~</div>
        <p>还没有文章，开始写第一篇吧！</p>
      </div>
      <table v-else class="admin-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>状态</th>
            <th>日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="post in posts" :key="post.id">
            <td>
              <strong>{{ post.title }}</strong>
              <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                <span v-for="tag in post.tags" :key="tag" class="tag" style="margin-right: 4px;">{{ tag }}</span>
              </div>
            </td>
            <td>
              <span :style="{ color: post.published ? 'var(--color-success)' : 'var(--color-text-muted)' }">
                {{ post.published ? '已发布' : '草稿' }}
              </span>
            </td>
            <td style="font-size: 0.85rem; color: var(--color-text-muted);">
              {{ formatDate(post.created_at) }}
            </td>
            <td>
              <div style="display: flex; gap: 4px;">
                <router-link
                  :to="{ name: 'AdminPostEdit', params: { id: post.id } }"
                  class="btn btn--sm"
                >编辑</router-link>
                <button class="btn btn--sm btn--danger" @click="handleDelete(post)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AdminHeader from '@/components/AdminHeader.vue'
import { api } from '@/api'

const router = useRouter()
const posts = ref([])
const loading = ref(true)

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

async function handleDelete(post) {
  if (!confirm(`确定删除「${post.title}」吗？`)) return
  try {
    await api.deletePost(post.id)
    posts.value = posts.value.filter(p => p.id !== post.id)
  } catch (e) {
    alert(e.message)
  }
}

onMounted(async () => {
  try {
    const data = await api.getPosts(1, true)
    posts.value = data.posts
  } catch (e) {
    if (e.message.includes('登录')) {
      router.push({ name: 'AdminLogin' })
    }
  } finally {
    loading.value = false
  }
})
</script>
