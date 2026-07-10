---
name: ai-chat-widget
description: |-
  Deploy an AI-powered chat widget to the yl-blog personal blog. Adds an Anthropic Claude-powered chat assistant to the homepage sidebar that can answer visitor questions about blog content. Covers backend proxy endpoint, frontend Vue component, admin settings UI, and styling following the Editorial Tech-Literary design system.
  TRIGGER when the user asks about: adding AI chat, chat widget, AI assistant, Claude integration on the blog, deploying the chat feature, setting up the chat sidebar, 添加AI聊天, AI对话, 博客AI助手, 智能客服.
---

# AI Chat Widget

为 yl-blog 个人博客添加一个 AI 聊天组件，在首页右侧展示，对接 Anthropic Claude API，能够根据博客已发布的文章内容回答访客问题。AI 的模型配置在后台管理页面进行配置。

## 架构

```
Browser (AiChat.vue) ──POST /api/chat──▶ Express (chat.js) ──fetch──▶ Anthropic API
                                              │
                                              ▼
                                         SQLite (posts + settings)
```

- **后端代理** 保护 API Key，API Key 不会暴露给前端
- **非流式响应**，v1 版本保持简洁（后续可升级流式）
- **上下文策略**：将已发布文章的标题、摘要、标签、日期作为上下文发送（不发送完整内容以控制 token 用量）
- 聊天历史存储在组件状态中（不持久化，每次最多发送最近 20 条消息）

## 涉及文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `server/src/db.js` | 修改 | 添加 4 个 AI 相关设置默认值 |
| `server/src/routes/chat.js` | 新建 | AI 聊天 API 端点（Anthropic 代理） |
| `server/src/index.js` | 修改 | 注册 chat 路由 |
| `client/src/api.js` | 修改 | 添加 `chat()` 方法 |
| `client/src/styles/global.css` | 修改 | 添加聊天组件样式（~150 行） |
| `client/src/components/AiChat.vue` | 新建 | 聊天组件（Vue 3 Composition API） |
| `client/src/views/Home.vue` | 修改 | 添加侧边栏网格布局 |
| `client/src/views/admin/Settings.vue` | 修改 | 添加 AI 配置区域 |

## 部署步骤

### 1. 数据库默认设置

在 `server/src/db.js` 的 `initTables()` 中添加 4 个新默认设置：

```js
insertSetting.run('ai_enabled', 'false');
insertSetting.run('ai_api_key', '');
insertSetting.run('ai_model', 'claude-opus-4-8');
insertSetting.run('ai_system_prompt', '你是这个个人博客的AI助手...');
```

### 2. 创建后端 API 端点

创建 `server/src/routes/chat.js`，实现 `POST /api/chat`：

- 公开端点（无需登录认证）
- 接收 `{ message, history }` 格式的请求体
- 返回 `{ reply: string }`
- 30 秒超时保护
- 完善的错误处理：API Key 未配置、AI 服务未启用、Anthropic API 错误、超时、通用异常

### 3. 注册路由

在 `server/src/index.js` 中添加：

```js
const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);
```

### 4. 前端 API 方法

在 `client/src/api.js` 的 `api` 对象中添加：

```js
chat(message, history = []) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history })
  });
}
```

### 5. 聊天组件样式

在 `client/src/styles/global.css` 末尾添加所有 `.ai-chat` 相关样式，遵循 Editorial Tech-Literary 设计规范：
- 使用 CSS 自定义属性（`--color-*`、`--space-*`、`--radius-*`）
- 用户消息背景 `--color-code-bg`
- AI 消息左侧 accent 色边框线
- 加载动画使用延时的三点脉冲效果
- 建议问题按钮类似 `.tag` 样式
- 响应式：1200px 以下隐藏侧边栏

### 6. 创建聊天组件

创建 `client/src/components/AiChat.vue`，处理以下状态：
- **隐藏**：`ai_enabled === 'false'` 时组件不渲染
- **空状态**：显示问候语 + 3 个可点击的建议问题
- **加载中**：三点脉冲动画，输入框禁用
- **错误**：显示错误信息 + 重试按钮
- **消息列表**：带自动滚动的消息列表
- **已折叠**：通过标题栏按钮切换折叠/展开

### 7. 修改首页布局

修改 `client/src/views/Home.vue`：
- 导入 `AiChat` 组件
- 将内容区域包装在 `.home-layout` 网格布局中
- 首页主体内容居中，右侧固定 280px 侧边栏（sticky 定位）

添加首页布局 CSS（在 global.css 中）：
```css
.home-layout {
  display: grid;
  grid-template-columns: 1fr minmax(auto, var(--max-width)) 280px 1fr;
  gap: var(--space-lg);
  align-items: start;
}
.home-sidebar {
  grid-column: 3;
  position: sticky; top: 96px;
}
```

### 8. 管理员设置页面

修改 `client/src/views/admin/Settings.vue`，在站点设置和修改密码之间添加 AI 配置区域：
- **启用开关**：toggle 控件（使用已有的 `.toggle` + `.toggle__slider` 样式）
- **API Key**：密码输入框（type="password" 保护隐私）
- **模型选择**：下拉菜单（Claude Opus 4.8 / Sonnet 5 / Haiku 4.5）
- **系统提示词**：文本域

### 9. 启用 AI 聊天

1. 启动项目：`npm run dev`
2. 前往 `/admin/settings`
3. 开启"启用 AI 聊天"开关
4. 填入 Anthropic API Key
5. 选择模型
6. 自定义系统提示词（可选）
7. 点击"保存设置"

### 10. 验证

1. 返回首页，检查右侧是否出现 AI 聊天窗口
2. 输入问题并发送，检查 AI 是否正常回复
3. 关闭 AI 聊天开关，检查聊天窗口是否消失
4. 调整浏览器窗口宽度，检查移动端是否隐藏侧边栏
5. 进入文章详情页，确认不影响现有的文章布局

## 自定义

### 更换 AI 提供商

如需使用其他 AI 提供商（如 OpenAI），修改 `server/src/routes/chat.js` 中的 API 调用逻辑即可，前端无需任何改动。

### 添加流式响应

在 `chat.js` 中添加 SSE (Server-Sent Events) 支持，在 `AiChat.vue` 中使用 `EventSource` 或 `fetch` 流式读取。

### 多轮对话记忆

当前版本聊天历史存储在组件内存中，刷新页面后丢失。如需持久化，可将对话记录存入 `localStorage` 或后端数据库。
