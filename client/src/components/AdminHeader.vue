<template>
  <header class="admin-header">
    <router-link to="/" class="admin-header__title">YL 管理后台</router-link>
    <nav class="admin-header__nav">
      <router-link :to="{ name: 'AdminPosts' }">文章</router-link>
      <router-link :to="{ name: 'AdminSettings' }">设置</router-link>
      <router-link :to="{ name: 'AdminRag' }">RAG</router-link>
      <a href="#" @click.prevent="handleLogout">退出</a>
    </nav>
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push({ name: 'AdminLogin' })
}
</script>
