## 1. BookDetailsPage — 模板调整

- [x] 1.1 将 `mobile-workspace-switcher` div 从 `.book-details-layout` 顶部移动到最后（after `.book-main-content`）

## 2. BookDetailsPage — CSS 布局修复

- [x] 2.1 将 `.mobile-workspace-switcher` 的 `border-bottom` 改为 `border-top`
- [x] 2.2 在 mobile media query 中，为 `.book-sidebar-mobile-visible` 添加 `flex: 1; min-height: 0`，确保目录模式下侧栏正确填充空间
- [x] 2.3 确认 `.book-main-content` 在 mobile media query 下有 `flex: 1; min-height: 0`（如无则添加）

## 3. MainLayout — 隐藏手机端 AppFooter

- [x] 3.1 在 `MainLayout.vue` 中，将 `<AppFooter />` 改为 `<AppFooter v-if="!isPhone" />`

## 4. 验证

- [x] 4.1 运行 `bun run lint && bun run type-check` 确认无报错
- [x] 4.2 在手机尺寸（≤480px）下确认底部导航显示正确，顶部内容空间扩大
- [x] 4.3 在平板尺寸（481px–1279px）下确认底部导航显示正确
- [x] 4.4 在桌面尺寸（≥1280px）下确认布局不受影响，AppFooter 正常显示
- [x] 4.5 切换目录/内容/设置/进度模式，确认激活状态和面板显示正确
