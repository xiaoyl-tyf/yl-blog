## 为什么需要 RAG？

在没有 RAG 之前，博客的 AI 聊天助手是这样工作的：把**所有已发布文章**的标题和摘要拼成一个长列表，塞进 AI 的 System Prompt 里。这种做法有几个致命问题：

1. **不含正文** — AI 只能看到摘要，无法回答深入的内容问题
2. **全量 dump** — 随着文章增多，prompt 越来越长，token 消耗越来越大
3. **无语义匹配** — 用户问"Vue 那种组合式 API 怎么写"，如果摘要里没有"Vue"这个词，AI 完全匹配不到

RAG（Retrieval-Augmented Generation）解决的就是这个问题：**每次根据用户的实际问题动态检索最相关的文章，只把这几篇的完整正文发给 AI**。

## 技术选型

### Embedding 模型：bge-m3

调研了 MTEB 排行榜后，选择了 BAAI 的 [bge-m3](https://huggingface.co/BAAI/bge-m3)，通过 Transformers.js 的 Xenova 转换版在本地运行：

| 对比项 | all-MiniLM-L6-v2（旧） | bge-m3（新） |
|--------|----------------------|-------------|
| 语言支持 | 英文为主 | 100+ 语言，中文最优 |
| 向量维度 | 384 | 1024 |
| Token 上限 | 256 | 8192 |
| 模型大小 | ~80MB | ~580MB |
| 中文检索质量 | ⭐ | ⭐⭐⭐ |

### 向量存储：SQLite + Float32 BLOB

没有用 Pinecone、Chroma、Milvus 这些向量数据库——博客就几十篇文章，没必要杀鸡用牛刀。

每篇文章的向量是一个 Float32Array(1024)，存成 BLOB 只要 **4096 字节**。余弦相似度计算用纯 JS 写，20 行搞定：

```javascript
function cosineSimilarity(a, b) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

对博客规模（<1000 篇文章），全量扫描在 Node.js 中 <5ms，完全够用。

### 架构一览

```
文章发布/更新 → storeEmbedding() → bge-m3 本地推理 → BLOB 存入 SQLite
访客提问       → embed(question)  → 余弦相似度扫描   → Top-K 文章 → 注入 AI Prompt
                                                           ↓ (模型不可用)
                                                    关键词 fallback
```

## 检索效果验证

在管理后台搜索 `AI 聊天插件功能 博客`，bge-m3 返回的结果：

| 排名 | 文章标题 | 相关度 |
|------|---------|--------|
| #1 | 给个人博客加上 AI 助手：完整实现攻略 | **59.7%** |
| #2 | 手把手打造你的自动化 AI 新闻助手 | 48.6% |
| #3 | Claude Code Skills 终极指南 | 42.8% |

bge-m3 精确地把"AI 聊天 + 博客"匹配到了最相关的实现攻略文章。这就是语义搜索和关键词匹配的本质区别——它理解"博客"和"项目实战"是强相关的，而不是在找包含"博客"二字的文章。

再试一次 `自动化 效率提升 工具使用技巧`：

| 排名 | 文章标题 | 相关度 |
|------|---------|--------|
| #1 | 手把手打造你的自动化 AI 新闻助手 | **49.8%** |
| #2 | 10分钟学会 24 个 Claude Code 使用技巧 | 49.0% |
| #3 | Claude Code Skills 终极指南 | 45.6% |

"自动化"和"效率提升"精准匹配到最有关系的文章。

## 管理后台：RAG 独立页面

在 `/admin/rag` 下新增了独立的 RAG 管理页面，提供四个功能区：

1. **嵌入向量概览** — 当前模型、向量维度、已嵌入/待重建文章统计
2. **多轮检索测试** — 3 个独立检索面板（每个可选 Top-1/3/5/10），可同时对比不同查询词效果
3. **手动喂入文本** — 输入任意文本 → 生成向量 → 预览前 5 维数值
4. **检索参数设置** — Top-K 数量 + 单篇截断长度

## 关键实现细节

### BGE-M3 的 Query/Document 前缀

bge-m3 需要用不同 prefix 区分 Query 和 Document 才能达到最优效果：

```javascript
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const DOC_PREFIX = '';

async function generateEmbedding(text, isQuery = false) {
  const prefixed = isQuery
    ? QUERY_PREFIX + text.slice(0, MAX_EMBEDDING_CHARS)
    : DOC_PREFIX + text.slice(0, MAX_EMBEDDING_CHARS);
  const model = await getEmbeddingModel();
  const output = await model(prefixed, { pooling: 'cls', normalize: true });
  return new Float32Array(output.data);
}
```

### Fire-and-Forget 嵌入生成

文章发布时 embedding 生成与保存解耦，不阻塞保存响应：

```javascript
res.json({ id: result.lastInsertRowid, slug });
const { storeEmbedding } = require('../rag');
storeEmbedding(result.lastInsertRowid).catch(err =>
  console.error('[rag] embedding failed:', err.message)
);
```

### 关键词 Fallback + 代理兼容

模型离线时自动降级到关键词命中打分；模型下载时自动复用 HTTP_PROXY。

## 总结

| 维度 | 改进前 | 改进后 |
|------|--------|--------|
| 上下文构建 | 全部文章摘要 dump | 语义检索 Top-K 文章正文 |
| 内容覆盖 | 仅摘要 | 标题 + 标签 + 摘要 + 正文 |
| 检索方式 | 无检索 | bge-m3 语义向量 + 关键词 fallback |
| API 成本 | 仅 AI 回复 | 仅 AI 回复（检索完全本地） |
| 模型依赖 | 无 | bge-m3 (~580MB, 本地 CPU) |
| 管理能力 | 无 | 独立 RAG 管理页 + 多轮检索测试 + 参数调节 |

这套方案对于个人博客已经足够——不需要单独的向量数据库，不需要调用外部 Embedding API，纯本地运行，零额外成本。
