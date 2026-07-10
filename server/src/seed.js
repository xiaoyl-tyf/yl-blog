const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

const db = getDb();

// Create default admin user
const password = bcrypt.hashSync('admin123', 10);
const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (username, password, display_name) VALUES (?, ?, ?)'
);
insertUser.run('admin', password, 'YL');

// Create sample posts
const samplePosts = [
  {
    title: '你好，世界',
    slug: 'hello-world',
    excerpt: '这是我的第一篇博客文章，很高兴开启这段写作之旅。',
    content: `# 你好，世界

这是我的第一篇博客文章。

## 为什么写博客？

记录思考，分享见闻，与志同道合的人交流。

## 关于这个博客

这个博客使用 Vue 3 构建，搭配 Node.js 后端。我会在这里分享：

- 技术心得
- 生活感悟
- 阅读笔记
- 有趣的项目

欢迎常来逛逛！`,
    tags: JSON.stringify(['随笔', '生活']),
    published: 1
  },
  {
    title: '在 Vue 3 中使用 Composition API',
    slug: 'vue3-composition-api',
    excerpt: '深入探讨 Vue 3 的 Composition API，以及它如何改变我们组织组件逻辑的方式。',
    content: `# 在 Vue 3 中使用 Composition API

Vue 3 引入了 Composition API，这不仅仅是一个新语法，更是一种全新的思维方式。

## 为什么需要 Composition API？

在 Vue 2 中，我们使用 Options API 来组织组件代码——data、methods、computed 分散在不同的选项中。当组件变得复杂时，相关逻辑会被拆散，导致代码难以维护。

Composition API 允许我们按功能组织代码，而不是按选项类型。

## 一个简单的例子

\`\`\`javascript
import { ref, computed, onMounted } from 'vue'

export default {
  setup() {
    const count = ref(0)
    const double = computed(() => count.value * 2)

    function increment() {
      count.value++
    }

    onMounted(() => {
      console.log('组件已挂载')
    })

    return { count, double, increment }
  }
}
\`\`\`

## 核心 API

- **ref / reactive**: 创建响应式状态
- **computed**: 创建计算属性
- **watch / watchEffect**: 监听变化
- **onMounted / onUnmounted**: 生命周期钩子

> Composition API 让逻辑复用变得更加优雅。
`,
    tags: JSON.stringify(['Vue', '前端技术']),
    published: 1
  },
  {
    title: '阅读笔记：设计的日常',
    slug: 'design-of-everyday-things',
    excerpt: '读《设计中的设计》的一些感悟，关于好设计是如何影响我们的日常生活的。',
    content: `# 阅读笔记：设计的日常

最近重读了原研哉的《设计中的设计》，有一些新的感悟。

## 设计即沟通

好的设计不仅仅是外观上的美化，更是信息与使用者之间的沟通桥梁。

> 设计不是一种技能，而是对生活本质的感受和理解。

## 留白的力量

日本设计中"留白"的概念很有意思——有时候不说什么比说什么更有力量。

在网页设计中也是如此：
- 足够的间距让内容呼吸
- 克制的色彩让重点突出
- 简洁的排版让阅读舒适

## 日常中的设计

当我们开始关注设计，就会发现生活中处处是好设计的影子——一个门把手、一盏路灯、一张车票。`,
    tags: JSON.stringify(['阅读', '设计']),
    published: 1
  }
];

const insertPost = db.prepare(`
  INSERT OR IGNORE INTO posts (title, slug, excerpt, content, tags, published)
  VALUES (@title, @slug, @excerpt, @content, @tags, @published)
`);

const insertMany = db.transaction((posts) => {
  for (const post of posts) {
    insertPost.run(post);
  }
});

insertMany(samplePosts);

console.log('Database seeded!');
console.log('Admin user: admin / admin123');
process.exit(0);
