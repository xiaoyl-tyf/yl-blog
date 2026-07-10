# 为个人博客添加 AI 智能客服：Claude API + Vue 3 实战

## 前言

作为一个技术博客的维护者，我希望访问者能够更方便地了解博客的内容。与其手动翻阅文章列表，不如直接问 AI："这个博客主要写什么？""有没有关于 Vue 的文章？"。

于是我给博客加了 AI 聊天功能——在首页右侧放一个聊天窗口，对接 Claude API，能根据博客已有的文章内容回答访客的问题。这篇文章记录完整的实现过程。

## 效果预览

完成后，首页右侧会出现一个 AI 聊天窗口：

- **默认关闭**：需要管理员在后台上启用
- **空状态**：显示三个建议问题，点击可以直接提问
- **自动上下文**：AI 自动获取所有已发布文章的信息作为背景知识
- **错误处理**：API Key 未配置时提示"请联系管理员"
- **响应式**：移动端自动隐藏侧边栏

## 架构设计

```
浏览器 (AiChat.vue) ──POST /api/chat──▶ Express (chat.js) ──fetch──▶ Anthropic API
                                            │
                                            ▼
                                       SQLite (文章 + 配置)
```

核心决策：

1. **后端代理模式**：前端不知道 API Key，所有请求通过 Express 后端转发
2. **非流式响应**：v1 版本保持简单，后续可升级 SSE 流式
3. **文章摘要作为上下文**：不发送完整文章内容（太长），只发标题+摘要+标签+日期
4. **配置在管理后台**：开启/关闭、API Key、模型选择、提示词都在后台管理

## 实现步骤

### 第一步：数据库添加 AI 配置

在 `server/src/db.js` 中添加 4 个默认配置：

```js
insertSetting.run('ai_enabled', 'false');
insertSetting.run('ai_api_key', '');
insertSetting.run('ai_model', 'claude-opus-4-8');
insertSetting.run('ai_system_prompt', '你是这个个人博客的AI助手...');
```

`ai_enabled` 默认为 `false`，意味着安装后不会自动启用——需要管理员主动去后台上打开。

### 第二步：创建后端 API 端点

新建 `server/src/routes/chat.js`，实现 `POST /api/chat`：

```js
router.post('/', async (req, res) => {
  const { message, history } = req.body;

  // 1. 检查是否启用
  const settings = getSettings();
  if (settings.ai_enabled !== 'true') {
    return res.status(403).json({ error: 'AI 聊天功能未启用' });
  }

  // 2. 检查 API Key
  if (!settings.ai_api_key) {
    return res.status(400).json({ error: 'AI API Key 未配置' });
  }

  // 3. 获取文章列表作为上下文
  const posts = db.prepare(
    'SELECT title, slug, excerpt, tags, created_at FROM posts WHERE published = 1'
  ).all();

  // 4. 构建上下文
  const blogContext = buildBlogContext(posts);

  // 5. 调用 Anthropic API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.ai_api_key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: settings.ai_model,
      max_tokens: 4096,
      system: `${settings.ai_system_prompt}\n\n${blogContext}`,
      messages: [...history, { role: 'user', content: message }]
    })
  });

  // 6. 返回回复
  const data = await response.json();
  res.json({ reply: data.content[0].text });
});
```

关键点：
- 公开端点，不需要登录认证
- 30 秒超时（使用 `AbortController`）
- 完善的错误处理：403（未启用）、400（未配置）、502（API 错误）、504（超时）、500（未知错误）

### 第三步：前端 API 方法

在 `client/src/api.js` 中添加 chat 方法：

```js
chat(message, history = []) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history })
  });
}
```

复用已有的 `request()` 封装，自动处理 JSON 序列化和错误解析。

### 第四步：创建聊天组件

新建 `client/src/components/AiChat.vue`，处理完整的状态：

```html
<template>
  <aside v-if="enabled" class="ai-chat">
    <!-- 标题栏：带折叠按钮 -->
    <div class="ai-chat__header">
      <h3 class="ai-chat__title">AI 助手</h3>
      <button @click="collapsed = !collapsed">{{ collapsed ? '+' : '−' }}</button>
    </div>

    <div v-show="!collapsed" class="ai-chat__body">
      <!-- 空状态：建议问题 -->
      <div v-if="messages.length === 0 && !loading && !error">
        <p>有什么关于博客的问题？可以问我。</p>
        <button v-for="q in questions" @click="send(q)">{{ q }}</button>
      </div>

      <!-- 消息列表 -->
      <div class="ai-chat__messages" ref="el">
        <div v-for="msg in messages" :class="msg.role">
          {{ msg.content }}
        </div>
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
      <form @submit.prevent="send()">
        <input v-model="input" :disabled="loading" maxlength="500" />
        <button :disabled="!input.trim() || loading">发送</button>
      </form>
    </div>
  </aside>
</template>
```

状态管理：
- `enabled` — 组件挂载时通过 `api.getSettings()` 检查是否启用
- `collapsed` — 折叠/展开切换
- `loading` — API 请求中，禁用输入框
- `error` + `retryable` — 错误展示与重试逻辑
- `messages` — 对话历史，最多保留 20 条发送给 API

### 第五步：修改首页布局

原本首页是居中单栏布局。现在改成四列网格：

```css
.home-layout {
  display: grid;
  grid-template-columns: 1fr minmax(auto, 680px) 280px 1fr;
  gap: var(--space-lg);
  align-items: start;
}
.home-main { grid-column: 2; }       /* 文章列表 */
.home-sidebar { grid-column: 3; }     /* AI 聊天 */
```

侧边栏设置为 `position: sticky; top: 96px`，滚动时始终可见。

移动端适配：
```css
@media (max-width: 1200px) {
  .home-layout {
    grid-template-columns: 1fr minmax(auto, 680px) 1fr;
  }
  .home-sidebar { display: none; }
}
```

### 第六步：管理后台配置页

在 `client/src/views/admin/Settings.vue` 中添加 AI 配置区域：

```
┌─────────────────────────────────────┐
│ 站点设置                            │
│ ├ 站点标题                          │
│ ├ 站点副标题                        │
│ └ 关于页面内容                      │
│          [保存设置]                 │
├─────────────────────────────────────┤
│ AI 聊天配置                         │
│ ├ 启用 AI 聊天        [toggle]      │
│ ├ Anthropic API Key   [****]        │
│ ├ 模型                 [下拉选择]    │
│ └ 系统提示词           [文本域]      │
├─────────────────────────────────────┤
│ 修改密码                            │
└─────────────────────────────────────┘
```

所有 AI 配置通过 `api.updateSetting(key, value)` 保存到数据库的 `settings` 表中。

### 第七步：设计样式

遵循博客的 Editorial Tech-Literary 设计系统，使用 CSS 自定义属性保持一致性：

- 聊天面板：白色背景 + 细边框 + 轻微阴影
- 用户消息：`--color-code-bg` 暖色背景，类似内联代码块
- AI 消息：左侧 accent 色细边线，类似 blockquote 风格
- 加载动画：三点脉冲，使用 accent 色，逐点延时
- 建议问题按钮：类似 tag 样式，hover 时变色
- 输入框和按钮：复用已有的 `.form-input` 和 `.btn` 模式

## 踩坑与经验

### 1. API Key 安全

API Key 绝对不能暴露给前端。后端代理模式虽然多了一层转发，但保证了安全性。前端代码中完全没有 API Key 的影子，所有 API 调用通过后端的 `/api/chat` 端点转发。

### 2. 上下文窗口管理

如果每篇文章的完整内容都塞进上下文，token 消耗会非常恐怖。我选择只发送标题、摘要、标签、日期——这已经足够 AI 判断哪些文章与问题相关了。

### 3. 设置值的类型一致性

SQLite 存储的是 TEXT 类型，所以 `ai_enabled` 用的是字符串 `"true"` / `"false"` 而不是布尔值。Vue 的 toggle checkbox 需要设置 `true-value="true"` 和 `false-value="false"` 来保持类型一致。

### 4. 错误处理的粒度

我设计了多层次的错误处理，每个层次都有中文提示：
- AI 未启用 → 403 + "请先在管理后台启用"
- API Key 未配置 → 400 + "请联系管理员"
- API 返回错误 → 502 + 透传错误信息
- 请求超时 → 504 + "请稍后重试"
- 未知错误 → 500 + "服务暂时不可用"

前端组件根据错误类型决定是否显示重试按钮。

### 5. 设计系统的一致性

给聊天组件写样式时，严格遵循已有的设计变量，不使用硬编码颜色值。这样如果以后博客换主题色，聊天组件也会自动适配。

```css
/* ✅ 好的做法 */
.ai-chat { background: var(--color-surface); border: 1px solid var(--color-border-light); }

/* ❌ 不好的做法 */
.ai-chat { background: #FFFFFF; border: 1px solid #F2EFE9; }
```

## 后续可以做的优化

- **流式响应**：通过 SSE (Server-Sent Events) 实现打字机效果，体验更好
- **对话持久化**：将聊天记录存入数据库，刷新不丢失
- **引用原文**：AI 回复时附带原文链接，方便访客深入了解
- **更多 AI 提供商**：支持 OpenAI、通义千问等，由管理员选择
- **RAG 增强**：使用文章全文做向量搜索，而非简单的摘要列表

## 总结

这个 AI 聊天功能从设计到实现花了大约半天时间。核心思路很简单：后端做代理保护 API Key，前端做组件管理 UI 状态，中间加上合理的错误处理和设计细节。

最让我满意的是：整个功能完全融入现有博客的设计系统，不突兀，不需要额外依赖，而且管理员可以随时关闭。对于个人博客来说，这是一个既实用又不破坏体验的 AI 集成方式。

完整的代码实现已经封装为 Claude Code Skill（`ai-chat-widget`），安装后 AI 可以帮你一键部署。
