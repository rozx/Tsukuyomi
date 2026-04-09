## Why

移动端章节内容页顶部有三层固定导航条（AppHeader + workspace switcher + ChapterToolbar），共占用约 160px 空间，加上 AppFooter 的版权信息条，实际可用内容区域被大幅压缩。底部导航是原生移动端应用的标准模式（iOS/Android 底部标签栏），更符合拇指操作习惯，同时释放顶部空间给内容。

## What Changes

- 将 `mobile-workspace-switcher`（目录/内容/设置/进度 四个标签）从页面顶部移动到底部
- 手机端隐藏 `AppFooter`（版权信息在小屏上无实用价值）
- 调整相关 CSS flex 布局，确保内容区域正确填充剩余空间
- 工具栏视觉样式适配（border-top 替代 border-bottom）

## Capabilities

### New Capabilities

- `mobile-bottom-nav`: 手机/平板端底部导航栏，替代原顶部 workspace switcher，提供目录/内容/设置/进度的切换入口

### Modified Capabilities

<!-- 无现有 spec 需要修改 -->

## Impact

- `src/pages/BookDetailsPage.vue` — 模板 DOM 顺序调整 + CSS flex 布局更新
- `src/layouts/MainLayout.vue` — 手机端条件隐藏 AppFooter
- 视觉效果：顶部减少约 96px 固定 chrome，内容区域明显扩大
