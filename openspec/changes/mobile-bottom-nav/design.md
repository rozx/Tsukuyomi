## Context

当前 `BookDetailsPage` 在移动端（≤1279px）的布局结构：

```
MainLayout (flex-col, h-screen)
  AppHeader (~56px)
  main.flex-1
    BookDetailsPage → .book-details-layout (flex-col on mobile)
      .mobile-workspace-switcher   ← 顶部导航条 (~56px)
      aside.book-sidebar           ← 目录（条件显示）
      .book-main-content           ← 章节内容 (flex: 1)
  AppFooter (~40px)
```

`mobile-workspace-switcher` 使用 `display: grid` 布局，4 个按钮带图标和文字，`min-height: 2.5rem`，总高约 56px。

## Goals / Non-Goals

**Goals:**
- 将 workspace switcher 移到布局底部，释放顶部空间
- 手机端隐藏 AppFooter（版权信息在小屏无意义）
- 布局 flex 逻辑保持正确，目录/内容模式切换不破坏

**Non-Goals:**
- 不修改 workspace switcher 的功能或交互逻辑
- 不修改平板端（tablet）行为（同 ≤1279px 范围内，与手机一同变更）
- 不引入 `position: fixed` 或滚动联动（保持简单）
- 不修改 ChapterToolbar 或章节元数据区域

## Decisions

### D1: DOM 重排 vs CSS order

**选择**: 直接将 `mobile-workspace-switcher` div 移动到 `.book-details-layout` 的最后一个子节点（after `.book-main-content`）。

**理由**: 在 flex-column 布局中，DOM 顺序即视觉顺序。CSS `order` 属性可实现同效果但徒增复杂度。直接重排 DOM 更直观、无额外 CSS 负担。

### D2: 内容区域高度填充

**选择**: 在 mobile media query 中，给 `.book-sidebar-mobile-visible` 添加 `flex: 1; min-height: 0`，确保目录模式下侧栏填满 workspace switcher 以上空间。

**理由**: `.book-main-content` 已有 `flex: 1`，但 `.book-sidebar-mobile-visible` 只设了 `display: block`，没有高度约束，移动后会不填满剩余空间。

### D3: AppFooter 隐藏方式

**选择**: 在 `MainLayout.vue` 中用 `v-if="!isPhone"` 包裹 `AppFooter`。`isPhone` 已是现有计算属性。

**理由**: 最小改动，不影响平板和桌面。不需要新增 store 状态或路由判断。

### D4: 视觉样式调整

**选择**: 将 `.mobile-workspace-switcher` 的 `border-bottom` 改为 `border-top`，保持视觉分隔线在正确位置。背景/颜色保持不变。

## Risks / Trade-offs

- **目录模式下侧栏高度**：若 `.book-sidebar-mobile-visible` 未正确设置 `flex: 1`，目录视图会缩短，留白在底部导航上方。→ 已在 D2 中处理。
- **平板影响**：媒体查询 ≤1279px 同时覆盖 tablet，底部导航对平板也生效。这是可接受的，平板用户也受益于更多内容空间。
- **iOS safe area**：如果将来需要支持 iPhone 刘海屏/Home Indicator，可补充 `padding-bottom: env(safe-area-inset-bottom)`，本次不做（非 PWA 场景）。

## Migration Plan

纯 CSS + 模板改动，无数据迁移，无 API 变更。直接部署即可。回滚只需还原两个文件的改动。
