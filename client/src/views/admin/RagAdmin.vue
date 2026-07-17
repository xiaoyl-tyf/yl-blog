<template>
  <div>
    <header class="admin-header">
      <router-link to="/" class="admin-header__title">YL 管理后台</router-link>
      <nav class="admin-header__nav">
        <router-link :to="{ name: 'AdminPosts' }">文章</router-link>
        <router-link :to="{ name: 'AdminSettings' }">设置</router-link>
        <router-link :to="{ name: 'AdminRag' }">RAG</router-link>
        <a href="#" @click.prevent="handleLogout">退出</a>
      </nav>
    </header>

    <div class="admin-content" style="max-width:960px; margin:2rem auto; padding:0 1rem">
      <h1>RAG 语义搜索管理</h1>

      <!-- Stats -->
      <section class="rag-card">
        <h2 class="rag-card__title">嵌入向量概览</h2>
        <div class="rag-stats">
          <div class="rag-stat">
            <span class="rag-stat__value">{{ stats.totalPosts ?? '...' }}</span>
            <span class="rag-stat__label">已发布文章</span>
          </div>
          <div class="rag-stat">
            <span class="rag-stat__value">{{ stats.withEmbeddings ?? '...' }}</span>
            <span class="rag-stat__label">已嵌入</span>
          </div>
          <div class="rag-stat">
            <span class="rag-stat__value" :class="{ 'rag-stat__value--warn': stats.withoutEmbeddings > 0 }">{{ stats.withoutEmbeddings ?? '...' }}</span>
            <span class="rag-stat__label">待重建</span>
          </div>
          <div class="rag-stat">
            <span class="rag-stat__value">{{ stats.embeddingModel || '—' }}</span>
            <span class="rag-stat__label">当前模型</span>
          </div>
          <div class="rag-stat">
            <span class="rag-stat__value">{{ stats.vectorDimensions || '—' }}</span>
            <span class="rag-stat__label">向量维度</span>
          </div>
        </div>
        <button class="btn" @click="handleRebuild" :disabled="rebuilding" style="margin-top:1rem">
          <span v-if="rebuilding" class="loading-spinner"></span>
          重建所有嵌入向量
        </button>
        <p v-if="rebuildResult" class="form-feedback" :class="rebuildResult.success > 0 ? 'form-feedback--success' : 'form-feedback--error'">
          {{ rebuildResult.success > 0 ? `成功重建 ${rebuildResult.success} 篇，失败 ${rebuildResult.failed} 篇` : '重建失败' }}
        </p>
      </section>

      <!-- Search test -->
      <section class="rag-card">
        <h2 class="rag-card__title">多轮检索测试</h2>
        <p class="form-hint">测试不同查询词的检索效果，结果之间互不干扰</p>

        <div class="rag-searches">
          <div v-for="(slot, idx) in searchSlots" :key="idx" class="rag-search-slot">
            <div class="rag-search-slot__header">
              <span class="rag-search-slot__label">检索 #{{ idx + 1 }}</span>
              <button class="btn-text" @click="clearSlot(idx)" v-if="slot.results || slot.error">清除</button>
            </div>
            <div class="rag-search-slot__row">
              <select v-model="slot.k" class="form-select" style="max-width:90px">
                <option :value="1">Top 1</option>
                <option :value="3">Top 3</option>
                <option :value="5">Top 5</option>
                <option :value="10">Top 10</option>
              </select>
              <input
                v-model="slot.query"
                type="text"
                class="form-input"
                placeholder="输入检索词..."
                style="flex:1"
                @keyup.enter="handleSlotSearch(idx)"
              />
              <button class="btn" @click="handleSlotSearch(idx)" :disabled="slot.searching">
                <span v-if="slot.searching" class="loading-spinner"></span>
                检索
              </button>
            </div>

            <div v-if="slot.searching" style="padding:0.5rem 0; color:var(--text-muted); font-size:0.85rem">
              正在检索...
            </div>

            <div v-if="slot.error" class="form-feedback form-feedback--error" style="margin-top:0.25rem">
              {{ slot.error }}
            </div>

            <div v-if="slot.results" style="margin-top:0.5rem">
              <p class="form-hint" style="margin-bottom:0.5rem">
                搜索 "{{ slot.results.query }}" 返回 {{ slot.results.results.length }} 条
                <template v-if="slot.results.results.length > 0 && slot.results.results[0].similarity <= 1 && slot.results.results[0].similarity > 0">
                  — 语义向量搜索
                </template>
                <template v-else-if="slot.results.results.length > 0">
                  — 关键词匹配
                </template>
              </p>
              <div v-if="slot.results.results.length === 0" style="color:var(--text-muted); font-size:0.85rem;">
                未找到相关文章
              </div>
              <div v-for="(r, i) in slot.results.results" :key="r.id"
                   class="rag-result-item"
                   :style="{ opacity: Math.max(0.4, (slot.results.results[0].similarity > 0 ? r.similarity / slot.results.results[0].similarity : 1)) }">
                <div class="rag-result-item__header">
                  <strong>#{{ i + 1 }} {{ r.title }}</strong>
                  <span class="rag-result-item__score">
                    相关度: {{ (r.similarity * 100).toFixed(1) }}%
                    <span v-if="r.similarity > 1" style="font-size:0.7rem"> (关键词命中)</span>
                    <span v-else style="font-size:0.7rem"> ({{ (r.similarity * 100).toFixed(1) }}%)</span>
                  </span>
                </div>
                <p class="rag-result-item__excerpt">{{ r.excerpt || '暂无摘要' }}</p>
                <div class="rag-result-item__tags">
                  <span v-for="t in r.tags" :key="t" class="tag-chip">{{ t }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Feed raw text -->
      <section class="rag-card">
        <h2 class="rag-card__title">手动喂入文本（Embedding 测试）</h2>
        <p class="form-hint">输入任意文本，生成其嵌入向量并预览向量前 5 个维度</p>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem">
          <textarea v-model="feedText" class="form-textarea" rows="3" placeholder="输入要向量化的文本..." style="flex:1"></textarea>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center">
          <button class="btn" @click="handleFeed" :disabled="feeding || !feedText.trim()">
            <span v-if="feeding" class="loading-spinner"></span>
            生成向量
          </button>
          <div v-if="feedResult" style="font-size:0.85rem; color:var(--text-secondary)">
            维度: {{ feedResult.dimensions }} |
            模型: {{ feedResult.model }} |
            前 5 维: {{ feedResult.preview?.join(', ') }}
          </div>
        </div>
        <p v-if="feedError" class="form-feedback form-feedback--error">{{ feedError }}</p>
      </section>

      <!-- Parameter settings -->
      <section class="rag-card">
        <h2 class="rag-card__title">检索参数设置</h2>
        <div class="form-group">
          <label class="form-label">默认检索数量 (Top-K)</label>
          <select v-model="ragTopK" class="form-select" style="max-width:200px">
            <option value="1">1 篇</option>
            <option value="3">3 篇（推荐）</option>
            <option value="5">5 篇</option>
          </select>
          <p class="form-hint">AI 聊天时检索多少篇最相关文章</p>
        </div>
        <div class="form-group">
          <label class="form-label">单篇文章最大内容长度</label>
          <input v-model="ragMaxLen" type="number" class="form-input" style="max-width:160px" min="500" max="8000" step="100" />
          <span class="form-hint" style="margin-left:0.5rem">字符（500-8000，默认 2000）</span>
          <p class="form-hint">发送给 AI 的单篇文章内容上限</p>
        </div>
        <button class="btn" @click="handleSaveParams" :disabled="savingParams">
          <span v-if="savingParams" class="loading-spinner"></span>
          保存参数
        </button>
        <span v-if="paramsSaved" class="form-feedback form-feedback--success" style="margin-left:0.5rem">已保存</span>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'

const router = useRouter()

const stats = ref({})
const rebuilding = ref(false)
const rebuildResult = ref(null)

const searchSlots = ref([
  { query: '', k: 3, searching: false, results: null, error: '' },
  { query: '', k: 3, searching: false, results: null, error: '' },
  { query: '', k: 3, searching: false, results: null, error: '' }
])

const feedText = ref('')
const feeding = ref(false)
const feedResult = ref(null)
const feedError = ref('')

const ragTopK = ref('3')
const ragMaxLen = ref('2000')
const savingParams = ref(false)
const paramsSaved = ref(false)

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push({ name: 'AdminLogin' })
}

async function loadStats() {
  try {
    stats.value = await api.getRagStats()
  } catch {}
}

async function handleRebuild() {
  rebuilding.value = true
  rebuildResult.value = null
  try {
    rebuildResult.value = await api.rebuildEmbeddings()
    await loadStats()
  } catch (e) {
    rebuildResult.value = { success: 0, failed: 1 }
  } finally {
    rebuilding.value = false
  }
}

async function handleSlotSearch(idx) {
  const slot = searchSlots.value[idx]
  if (!slot.query.trim()) return
  slot.searching = true
  slot.results = null
  slot.error = ''
  try {
    slot.results = await api.ragSearch(slot.query.trim(), slot.k)
  } catch (e) {
    slot.error = e.message || '检索失败'
  } finally {
    slot.searching = false
  }
}

function clearSlot(idx) {
  searchSlots.value[idx].results = null
  searchSlots.value[idx].error = ''
  searchSlots.value[idx].query = ''
}

async function handleFeed() {
  const text = feedText.value.trim()
  if (!text) return
  feeding.value = true
  feedResult.value = null
  feedError.value = ''
  try {
    feedResult.value = await api.feedRawText(text)
  } catch (e) {
    feedError.value = e.message || '生成失败'
  } finally {
    feeding.value = false
  }
}

async function handleSaveParams() {
  savingParams.value = true
  paramsSaved.value = false
  try {
    await api.updateSetting('ai_rag_top_k', ragTopK.value)
    await api.updateSetting('ai_rag_max_content_length', ragMaxLen.value)
    paramsSaved.value = true
  } catch {}
  savingParams.value = false
}

onMounted(async () => {
  await loadStats()
  try {
    const settings = await api.getSettings()
    ragTopK.value = settings.ai_rag_top_k || '3'
    ragMaxLen.value = settings.ai_rag_max_content_length || '2000'
  } catch {}
})
</script>

<style scoped>
.rag-card {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.rag-card__title {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
.rag-stats {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.rag-stat {
  text-align: center;
  min-width: 80px;
}
.rag-stat__value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
}
.rag-stat__value--warn {
  color: #e53e3e;
}
.rag-stat__label {
  font-size: 0.8rem;
  color: var(--text-muted, #718096);
}
.rag-searches {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.rag-search-slot {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 0.75rem;
}
.rag-search-slot__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.rag-search-slot__label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted, #718096);
}
.rag-search-slot__row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.rag-result-item {
  padding: 0.6rem;
  margin-bottom: 0.35rem;
  background: var(--bg-hover, #f7fafc);
  border-radius: 6px;
  transition: opacity 0.2s;
}
.rag-result-item__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.15rem;
  gap: 0.5rem;
}
.rag-result-item__score {
  font-size: 0.8rem;
  color: var(--text-muted, #718096);
  white-space: nowrap;
}
.rag-result-item__excerpt {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary, #4a5568);
}
.rag-result-item__tags {
  margin-top: 0.25rem;
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.btn-text {
  background: none;
  border: none;
  color: var(--link-color, #3182ce);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
}
</style>
