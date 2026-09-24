## Why

Every `*Tablet.vue` variant today (the shell `MainLayoutTablet`, all 7 page variants, and several component variants that *do* have a Tablet file) is either a three-line pass-through that re-renders the `Desktop` variant or a near-copy of the desktop template. The result on tablet-sized viewports is desktop chrome compressed into a smaller window — the full 16rem side menu, the desktop `AppHeader`, desktop-density pages — which wastes horizontal real estate, forces the overlay sidebar open when the user only wants content, and doesn't match the native-app density expected on iPad / 10–12" Android tablets.

A Claude Design handoff bundle under `/tmp/design-tsukuyomi/` now specifies a dedicated tablet design language — slim 64px left icon rail + top utility strip + multi-pane page layouts (dashboard home, master-detail library, dual-pane reader with chapter drawer, three-pane chat, centered modal settings, right-docked translation progress). This change adapts **every page and every layout component** to that design, using the mockups as the visual spec and the existing mobile + desktop variants as the feature-availability reference — no new product features, services, or store state are introduced.

## What Changes

**Shell chrome (new tablet components)**

- Add `TabletNavRail` — slim 64px icon rail with Home / Library / Reader / Chat / AI / Settings affordances, replacing the expand/collapse `AppSideMenu` on tablet.
- Add `TabletSysBar` — horizontal top utility strip carrying the same brand + AI-thinking / sync / notifications / help cluster as `MobileSysBar`, in a tablet-width layout.
- Rewrite `MainLayoutTablet.vue` to compose `TabletSysBar` on top, `TabletNavRail` on the left, router-view main content, and the existing `AppRightPanel` as an overlay (unchanged panel, only the shell around it changes).

**Page variants (rewrite all 7)**

- `IndexPageTablet` → two-column dashboard: greeting + active-job / continue-reading cards + 5-column stats strip + quick actions + 3-column recent-books grid.
- `BooksPageTablet` → master-detail: book list pane (320px) on the left, selected-book detail hero + stats + two-column chapter tree on the right.
- `BookDetailsTablet` → slim chapter drawer (220px) + main reader area with dual-pane 原文 / 译文 paragraph rows + floating action bar when a paragraph is selected. Settings workspace tabs become a docked tab strip above the content.
- `SettingsPageTablet` → centered modal-feel layout: horizontal tab bar (AI 模型 · 代理设置 · API Keys · 同步设置 · 爬虫设置 · 导入/导出 · 记忆注入), two-column form grid for AI Models tab.
- `AIPageTablet` → wider two-column layout for provider list + provider detail (mirrors the desktop structure but with tablet spacing).
- `HelpPageTablet` → two-column doc layout (nav rail + article pane) with tablet typography.
- `NotFoundPageTablet` → centered tablet-width empty state.

**Component variants (tablet adaptations where the design diverges from desktop)**

- `TranslationProgressTablet` already exists as a placeholder → rewrite to the right-docked panel per the mockup (hero meter, 实时 / 统计 / 日志 tabs, live queue, footer 暂停 / 取消 / 批量设置 actions) so it matches the overlay shown on the tablet reader canvas.
- `AppRightPanelTablet` → audit and (where needed) adjust so it integrates with the new `TabletNavRail` + `TabletSysBar` shell (width, border, header row).
- `AdaptiveDialog`, `MobileBottomSheet`, and the various `*Popover` surfaces are **not duplicated** — the existing `useDeviceVariant()` dispatch already selects the right variant per device, and the mockup confirms tablet uses the desktop dialog flavor (not the bottom-sheet flavor).

**Everything else stays**

- No composable / store / service / router / AI / IndexedDB changes. Every tablet variant consumes the same `injectXxx()` helpers the mobile variant already uses and binds to the same Pinia stores the desktop variant binds to.
- No new dispatcher logic — dispatchers under `src/pages/*.vue` continue to pick variants via `useDeviceVariant()`.

## Capabilities

### New Capabilities

- `tablet-shell-chrome`: the tablet application shell — slim left icon nav rail (`TabletNavRail`) + top utility strip (`TabletSysBar`) composed inside `MainLayoutTablet` — replacing the current desktop-cloned tablet shell.
- `tablet-page-layouts`: tablet-adapted templates for all 7 main page variants, rendered inside the tablet shell and fed by the same composables / stores the mobile and desktop variants use.
- `tablet-component-variants`: tablet-adapted component surfaces that diverge from desktop per the mockup — currently the translation progress right-dock panel and the tablet right-panel shell.

### Modified Capabilities

(none — `responsive-app-shell` already requires a tablet breakpoint layout distinct from phone and desktop; this change implements that requirement without altering the spec text)

## Impact

- **Files added**: `src/components/layout/TabletNavRail.vue`, `src/components/layout/TabletSysBar.vue`.
- **Files rewritten**: `src/layouts/main-layout/MainLayoutTablet.vue`, `src/pages/index-page/IndexPageTablet.vue`, `src/pages/books-page/BooksPageTablet.vue`, `src/pages/book-details/BookDetailsTablet.vue`, `src/pages/ai-page/AIPageTablet.vue`, `src/pages/settings-page/SettingsPageTablet.vue`, `src/pages/help-page/HelpPageTablet.vue`, `src/pages/not-found-page/NotFoundPageTablet.vue`, `src/components/novel/TranslationProgressTablet.vue`, `src/components/layout/AppRightPanelTablet.vue` (audit + minor adjustments).
- **Files untouched**: all composables, stores, services, routing, AI / translation / sync layers, IndexedDB schema, desktop and mobile variants, existing dispatchers.
- **Design source of truth**: `/tmp/design-tsukuyomi/project-tsukuyomi/project/tablet.jsx` + `tablet-more.jsx` + `Tsukuyomi Mobile.html` (mockup), using `mobile.css` design tokens already mirrored in `src/css/`.
- **Feature-availability reference**: the existing `*Mobile.vue` and `*Desktop.vue` variants — if a control / data point isn't wired up in either mobile or desktop today, the tablet variant does not invent it (the design is a mockup, not a feature spec).
- **Risks**: regressions on real tablet hardware if the new shell breaks `useOverlayCloseStack` wiring for the right panel, or if nav-rail routing diverges from the mobile tab bar's active-tab rules. Mitigated by reusing the existing router paths + `useUiStore` helpers that `MobileTabBar` already uses, and by keeping the `AppRightPanel` overlay behavior unchanged.
