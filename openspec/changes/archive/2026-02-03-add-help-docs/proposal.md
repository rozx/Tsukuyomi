## Why

Currently, Tsukuyomi 翻译器缺乏统一的帮助文档系统。用户需要通过代码或界面探索来了解功能使用方法，新用户上手困难。建立一个集中化的帮助文档系统，能够提升用户体验，降低学习成本，同时为 AI 助手提供知识库支持。

## What Changes

- 创建帮助文档目录结构，存储于 `public/help/` 文件夹
- 编写首页帮助文档（front-page.md），介绍应用核心功能
- 增强现有的 `src/pages/HelpPage.vue` 组件，添加 Markdown 渲染功能
- 使帮助文档可通过 Web 界面和 AI 助手双向访问
- 建立帮助文档更新机制

## Capabilities

### New Capabilities

- `help-docs`: 帮助文档系统，包括文档存储、渲染和访问机制

### Modified Capabilities

- `help-page`: 增强现有的帮助页面组件，添加 Markdown 渲染和导航功能

### Modified Capabilities

- (无)

## Impact

- **新增文件**: `public/help/front-page.md` 等帮助文档
- **修改组件**: 增强 `src/pages/HelpPage.vue` 添加 Markdown 渲染
- **AI 集成**: AI 助手可读取帮助文档作为知识库
- **无破坏性变更**: 纯新增功能，不影响现有代码
