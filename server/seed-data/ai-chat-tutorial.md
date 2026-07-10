# 给个人博客加上 AI 助手：完整实现攻略

> 用半天时间，为你的博客添加一个能回答访客问题的 AI 聊天组件。全程只需一个后端代理、一个 Vue 组件、几段 CSS，不引入额外依赖。

---

## 最终效果

- 首页右侧出现 AI 聊天窗口（可折叠）
- 自动获取博客文章列表作为上下文，AI 据此回答访客问题
- 支持 Anthropic Claude 和 DeepSeek 两种模型，后台随时切换
- 管理员可在后台配置：开关、API Key、模型、系统提示词
- API Key 全程不暴露给前端
- 移动端自动隐藏侧边栏

---

## 架构

```
浏览器 (AiChat.vue) ──POST /api/chat──▶ Express (chat.js) ──fetch──▶ Anthropic / DeepSeek API
                                              │
                                              ▼
                                         SQLite (文章 + 配置)
```

**核心决策：**

| 决策 | 选择 | 原因 |
|------|------|------|
| 调用方式 | 后端代理 | API Key 不暴露给前端 |
| 响应方式 | 非流式 | v1 保持简单，后续可升级 SSE |
| 上下文 | 标题+摘要+标签 | 避免 token 爆炸，信息够用 |
| 配置管理 | 管理后台 | 非技术人员也能操作 |

---

## 第一步：数据库添加配置项

**文件：`server/src/db.js`**

在 `initTables()` 的默认设置区域添加 4 个初始值：

```js
insertSetting.run('ai_enabled', 'false');        // 默认关闭
insertSetting.run('ai_api_key', '');             // 空，等管理员填入
insertSetting.run('ai_model', 'claude-opus-4-8'); // 默认模型
insertSetting.run('ai_system_prompt', '你是这个个人博客的AI助手...');
```

> **注意：** SQLite 的 settings 表 value 全是 TEXT。`ai_enabled` 用字符串 `"true"` / `"false"`，不是布尔值。

---

## 第二步：创建后端 API 端点

**新建文件：`server/src/routes/chat.js`**

`POST /api/chat`，公开端点，无需登录。

### 核心逻辑

```js
router.post('/', async (req, res) => {
  const { message, history } = req.body;

  // 1. 读取 AI 配置
  const settings = getSettingsFromDb();

  // 2. 检查是否启用
  if (settings.ai_enabled !== 'true') {
    return res.status(403).json({ error: 'AI 聊天功能未启用' });
  }

  // 3. 检查 API Key
  if (!settings.ai_api_key) {
    return res.status(400).json({ error: 'AI API Key 未配置' });
  }

  // 4. 获取已发布文章作为上下文
  const posts = db.prepare(
    'SELECT title, slug, excerpt, tags, created_at FROM posts WHERE published = 1'
  ).all();

  // 5. 构建文章列表上下文
  const blogContext = buildBlogContext(posts);

  // 6. 根据模型区分 API 格式
  const isDeepSeek = model.startsWith('deepseek');
  if (isDeepSeek) {
    // DeepSeek: OpenAI 兼容格式
    response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: fullPrompt }, ...msgHistory]
      })
    });
    reply = data.choices[0].message.content;
  } else {
    // Anthropic: 原生格式
    response = await fetch('https://api.anthropic.com/v1/messages', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        system: fullPrompt,
        messages: msgHistory
      })
    });
    reply = data.content[0].text;
  }

  res.json({ reply });
});
```

### 错误处理（五个层次）

| 场景 | 状态码 | 前端行为 |
|------|--------|---------|
| AI 未启用 | 403 | 显示提示 |
| API Key 未配置 | 400 | 提示联系管理员 |
| API 返回错误 | 502 | 显示错误 + 重试按钮 |
| 请求超时（30s） | 504 | 提示稍后重试 |
| 未知错误 | 500 | 提示稍后重试 |

### 注册路由

在 `server/src/index.js` 中：

```js
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);
```

---

## 第三步：前端 API 封装

**文件：`client/src/api.js`**

```js
chat(message, history = []) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history })
  });
}
```

复用已有的 `request()` 方法，自动处理 JSON 解析和错误。

---

## 第四步：创建聊天组件

**新建文件：`client/src/components/AiChat.vue`**

### 状态设计

组件需要覆盖 6 种状态：

| 状态 | 触发条件 | 展示内容 |
|------|---------|---------|
| 隐藏 | `ai_enabled = false` | 不渲染任何内容 |
| 空状态 | 无消息、无 loading、无错误 | 问候语 + 3 个建议问题按钮 |
| 加载中 | API 请求中 | 三点脉冲动画，输入框禁用 |
| 消息列表 | 有对话记录 | 用户消息 + AI 回复（Markdown 渲染） |
| 错误 | 请求失败 | 错误信息 + 重试按钮 |
| 折叠 | 点击标题栏按钮 | 仅显示标题栏 |

### 关键实现细节

```html
<template>
  <aside v-if="enabled" class="ai-chat">
    <!-- 标题 + 折叠按钮 -->
    <div class="ai-chat__header">
      <h3>AI 助手</h3>
      <button @click="collapsed = !collapsed">{{ collapsed ? '+' : '−' }}</button>
    </div>

    <div v-show="!collapsed" class="ai-chat__body">
      <!-- 空状态 -->
      <div v-if="isEmpty" class="ai-chat__empty">
        <p>有什么关于博客的问题？可以问我。</p>
        <button v-for="q in questions" @click="send(q)">{{ q }}</button>
      </div>

      <!-- 消息列表 -->
      <div class="ai-chat__messages" ref="msgEl">
        <div v-for="msg in messages" :class="msg.role">
          <!-- AI 消息：Markdown 渲染 -->
          <div v-if="msg.role === 'assistant'" v-html="renderMarkdown(msg.content)"></div>
          <!-- 用户消息：纯文本 -->
          <div v-else>{{ msg.content }}</div>
        </div>
        <!-- 加载动画 -->
        <div v-if="loading" class="ai-chat__loading">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>

      <!-- 错误 + 重试 -->
      <div v-if="error">
        <p>{{ error }}</p>
        <button v-if="retryable" @click="retry">重试</button>
      </div>

      <!-- 输入框 -->
      <form @submit.prevent="sendMsg()">
        <input v-model="input" :disabled="loading" maxlength="500" />
        <button :disabled="!input.trim() || loading">发送</button>
      </form>
    </div>
  </aside>
</template>
```

### Markdown 渲染

```js
import { marked } from 'marked'

function renderMarkdown(text) {
  if (!text) return ''
  return marked(text, { breaks: true })
}
```

AI 消息用 `v-html` 渲染 Markdown，用户消息保持纯文本（防止 XSS）。

### 重试逻辑

```js
function retry() {
  // 移除最后一条用户消息，重新发送
  const last = messages.value.pop()
  input.value = last.content
  error.value = ''
  sendMsg()
}
```

### 上下文窗口管理

```js
const MAX_HISTORY = 20

async function sendMsg() {
  // 只发送最近 20 条消息给 API
  const history = messages.value.slice(-MAX_HISTORY - 1, -1)
  const data = await api.chat(input.value, history)
  messages.value.push({ role: 'assistant', content: data.reply })
}
```

---

## 第五步：修改首页布局

**文件：`client/src/views/Home.vue` + `client/src/styles/global.css`**

从单栏居中改为四列网格：`左留白 | 文章列表 | 侧边栏 | 右留白`

```css
.home-layout {
  display: grid;
  grid-template-columns: 1fr minmax(auto, 680px) 280px 1fr;
  gap: var(--space-lg);
  align-items: start;
}
.home-main    { grid-column: 2; }  /* 文章列表 */
.home-sidebar { grid-column: 3; }  /* AI 聊天 */

/* 侧边栏滚动时固定 */
.home-sidebar {
  position: sticky;
  top: 96px;
}

/* 移动端隐藏侧边栏 */
@media (max-width: 1200px) {
  .home-layout {
    grid-template-columns: 1fr minmax(auto, 680px) 1fr;
  }
  .home-sidebar { display: none; }
}
```

---

## 第六步：管理后台配置

**文件：`client/src/views/admin/Settings.vue`**

在后台设置页添加 "AI 聊天" 板块，包含：

- **启用开关** — toggle + 内联状态文字（"已开启 — 首页右侧显示聊天窗口"）
- **API 服务商** — 下拉切换 Anthropic / DeepSeek，模型列表联动变化
- **API Key** — 密码输入框，附带提示"仅在服务端使用"
- **模型选择** — 根据服务商动态显示可选模型
- **系统提示词** — 多行文本域，定义 AI 角色行为

```js
// 根据已保存的模型名称自动识别服务商
aiProvider.value = (settings.ai_model || '').startsWith('deepseek')
  ? 'deepseek' : 'anthropic'
```

当用户切换服务商时，模型列表自动更新：

```html
<select v-model="aiModel">
  <template v-if="aiProvider === 'anthropic'">
    <option value="claude-opus-4-8">Claude Opus 4.8 — 最强推理</option>
    <option value="claude-sonnet-5">Claude Sonnet 5 — 性价比推荐</option>
    <option value="claude-haiku-4-5">Claude Haiku 4.5 — 轻量快速</option>
  </template>
  <template v-else>
    <option value="deepseek-v4-flash">DeepSeek V4 Flash — 高性价比</option>
    <option value="deepseek-v4-pro">DeepSeek V4 Pro — 强推理</option>
  </template>
</select>
```

---

## 样式设计要点

遵循博客已有的设计系统，不写硬编码颜色：

```css
/* ✅ 使用设计变量 */
.ai-chat { background: var(--color-surface); }
.ai-chat__message--user { background: var(--color-code-bg); }
.ai-chat__message--assistant { border-left: 2px solid var(--color-accent); }

/* ❌ 避免硬编码 */
/* .ai-chat { background: #FFFFFF; } */
```

消息气泡的风格区分：

- **用户消息**：暖色代码块背景，类似 inline code
- **AI 消息**：左侧 accent 色边线，类似 blockquote
- **加载动画**：三点脉冲，逐点延时，accent 色

---

## 踩坑记录

### 1. API 格式差异

Anthropic 和 DeepSeek 的 API 格式完全不同。关键区别：

| | Anthropic | DeepSeek |
|---|---|---|
| 端点 | `/v1/messages` | `/v1/chat/completions` |
| 认证头 | `x-api-key` | `Authorization: Bearer` |
| 系统提示 | 独立 `system` 参数 | messages 数组第一条 |
| 回复路径 | `data.content[0].text` | `data.choices[0].message.content` |

### 2. 模型名称过期

DeepSeek 在 2026 年 4 月发布了 V4，旧名称 `deepseek-chat` 已废弃。务必使用 `deepseek-v4-flash` 或 `deepseek-v4-pro`。

### 3. 设置值类型

SQLite 存的是 TEXT，`ai_enabled` 必须用字符串 `"true"` / `"false"`。Vue checkbox 的 `true-value` / `false-value` 属性要同步设置。

### 4. 上下文经济性

不要把文章全文塞进上下文——只发标题、摘要、标签、日期已经足够 AI 判断相关性了。全文发送会让 token 消耗暴涨。

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/src/db.js` | 修改 | 添加 4 个 AI 配置默认值 |
| `server/src/routes/chat.js` | **新建** | 后端代理端点 |
| `server/src/index.js` | 修改 | 注册 chat 路由 |
| `client/src/api.js` | 修改 | 添加 `chat()` 方法 |
| `client/src/components/AiChat.vue` | **新建** | 聊天组件 |
| `client/src/views/Home.vue` | 修改 | 添加侧边栏布局 |
| `client/src/views/admin/Settings.vue` | 修改 | AI 配置界面 |
| `client/src/styles/global.css` | 修改 | 聊天组件 + 布局样式 |

**总计：3 个新文件，5 个修改文件**，无额外 npm 依赖（`marked` 已安装）。

---

## 后续可扩展

- **流式响应**：用 SSE 实现逐字输出，体验更像 ChatGPT
- **对话持久化**：聊天记录存数据库，刷新不丢失
- **RAG 增强**：用全文向量搜索替代摘要列表，回答更精准
- **更多模型**：接入 OpenAI、通义千问等，架构已支持只需加分支

---

## 总结

核心思路就三步：**后端代理保护 Key → 前端组件管 UI → 管理后台做配置**。整个流程不引入额外依赖，完全融入已有设计系统，管理员可随时关闭。对个人博客来说，这是一个实用又不破坏体验的 AI 集成方式。
