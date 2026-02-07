## Context

Tsukuyomi 翻译器目前已有基础的 `src/pages/HelpPage.vue` 组件，但仅显示简单的占位文本。用户缺乏完整的帮助文档来了解应用功能。本项目旨在建立一个完整的帮助文档系统，将 Markdown 格式的文档存储在 `public/help/` 目录下，通过现有的帮助页面组件渲染展示。

### 技术栈

- Vue 3 + TypeScript
- Quasar UI 框架
- Vite 构建工具
- marked (Markdown 渲染，已在项目中使用)

## Goals / Non-Goals

**Goals:**

- 创建 `public/help/` 目录存储 Markdown 帮助文档
- 编写 `front-page.md` 介绍应用核心功能
- 增强现有 HelpPage.vue 以动态加载和渲染 Markdown
- 实现帮助文档导航系统
- 确保帮助文档可被 AI 助手访问作为知识库

**Non-Goals:**

- 不实现完整的 CMS 系统
- 不支持运行时编辑帮助文档
- 不实现文档搜索功能（可作为后续功能）
- 不实现多语言帮助文档（初期仅支持中文）

## Decisions

### 1. 文档存储位置: `public/help/`

**Rationale:** 使用 `public/` 目录确保文档在构建时被复制到输出目录，可通过 HTTP 直接访问。这对于 Vue 组件通过 fetch 加载文档至关重要。

**Alternative considered:**

- `src/assets/help/` - 需要 import，无法动态加载
- 数据库存储 - 过于复杂，不适合静态文档

### 2. Markdown 渲染库: marked

**Rationale:** 项目已使用 marked 库（见 `src/utils/markdown.ts`），保持一致性。

### 3. 文件命名约定

- `front-page.md` - 首页帮助，默认显示
- `feature-*.md` - 功能相关帮助文档
- 使用 kebab-case 命名

### 4. 组件架构

**HelpPage.vue 将包含：**

- 侧边栏导航：列出可用帮助文档
- 主内容区：渲染选中的 Markdown
- 使用 Quasar 的 `q-splitter` 或类似布局

### 5. 文档加载策略

- 使用 `fetch()` 动态加载 Markdown 文件
- 使用目录索引文件（`index.json`）列出所有可用文档
- 支持懒加载，按需获取文档内容

## Risks / Trade-offs

**[Risk] 文档与代码不同步**

- **Mitigation:** 建立文档更新检查清单，在功能变更时同步更新帮助文档

**[Risk] Markdown 渲染安全问题 (XSS)**

- **Mitigation:** 使用 marked 的 sanitize 选项，或在渲染前清理 HTML

**[Trade-off] 静态文件 vs 动态生成**

- 使用静态 Markdown 文件虽然简单，但需要手动更新
- 未来可考虑从代码注释或类型定义自动生成部分文档

## Migration Plan

1. 创建 `public/help/` 目录
2. 创建 `front-page.md` 文档
3. 生成 `index.json` 文档索引
4. 更新 HelpPage.vue 组件添加 Markdown 渲染功能
5. 添加导航侧边栏
6. 测试所有帮助文档链接
7. 更新 AI 助手系统提示词，使其能够引用帮助文档

## Open Questions (Resolved)

1. **是否需要为帮助文档添加版本控制或更新日期显示？**
   - **Decision:** 创建一个单独的 `updates.md` 文件记录所有帮助文档的更新/变更历史，不在每个文档中显示版本信息。

2. **是否需要支持文档内的锚点导航（heading links）？**
   - **Decision:** 是，支持 heading links 锚点导航，允许用户点击标题链接跳转到特定章节。

3. **AI 助手访问帮助文档的最佳方式（直接文件读取 vs API 端点）？**
   - **Decision:** 直接文件读取，AI 助手直接读取 `public/help/` 目录下的 Markdown 文件内容。
