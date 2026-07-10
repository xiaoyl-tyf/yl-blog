<template>
  <header class="site-header">
    <div class="container">
      <div class="site-header__inner">
        <router-link to="/" class="site-logo">{{ settings.site_title || 'YL' }}</router-link>
        <nav class="site-nav">
          <router-link to="/">首页</router-link>
          <router-link to="/about">关于</router-link>
        </nav>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/api'

const settings = ref({})

onMounted(async () => {
  try {
    settings.value = await api.getSettings()
  } catch {}
})
</script>
