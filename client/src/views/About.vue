<template>
  <div class="page-section">
    <div class="container container--narrow">
      <h1 class="page-title">关于</h1>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="about-content" v-html="renderedAbout"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import { api } from '@/api'

const content = ref('')
const loading = ref(true)

const renderedAbout = computed(() => {
  if (!content.value) return '<p>这里还没有内容。</p>'
  return marked(content.value, { breaks: true })
})

onMounted(async () => {
  try {
    const settings = await api.getSettings()
    content.value = settings.about_content || ''
  } catch {} finally {
    loading.value = false
  }
})
</script>
