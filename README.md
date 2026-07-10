# YL Blog

个人技术博客，基于 Vue 3 + Express 构建，支持 Markdown 写作与管理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vue Router + Vite |
| 后端 | Express + SQLite |
| 编辑器 | Markdown（marked 渲染） |
| 认证 | JWT |

## 快速开始

```bash
# 安装所有依赖
npm run install:all

# 启动开发环境（前端 + 后端）
npm run dev

# 仅启动前端
npm run dev:client

# 仅启动后端
npm run dev:server

# 构建生产版本
npm run build
```

前端运行在 `http://localhost:5173`，后端 API 运行在 `http://localhost:3001`。

## 项目结构

```
yl-blog/
├── client/          # Vue 3 前端
│   └── src/
│       ├── views/       # 页面组件
│       │   └── admin/   # 后台管理页面
│       ├── components/  # 公共组件
│       ├── styles/      # 全局样式
│       └── router.js    # 路由配置
├── server/          # Express 后端
│   └── src/
│       ├── routes/      # API 路由
│       ├── db.js        # 数据库初始化
│       └── seed.js      # 种子数据
└── DESIGN.md        # 设计规范
```

## 设计风格

Editorial Tech-Literary — 中文杂志与科技出版物的结合。排版驱动，大量留白，阅读优先。详见 [DESIGN.md](./DESIGN.md)。
