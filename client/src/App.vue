<template>
  <div v-if="isAdminRoute" class="admin-layout">
    <router-view />
  </div>
  <div v-else>
    <site-header />
    <main>
      <router-view />
    </main>
    <site-footer />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
</script>
