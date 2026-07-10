<template>
  <footer class="site-footer">
    <div class="container">
      <p>&copy; {{ year }} {{ settings.site_title || 'YL' }}. All rights reserved.</p>
    </div>
  </footer>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/api'

const year = new Date().getFullYear()
const settings = ref({})

onMounted(async () => {
  try {
    settings.value = await api.getSettings()
  } catch {}
})
</script>
