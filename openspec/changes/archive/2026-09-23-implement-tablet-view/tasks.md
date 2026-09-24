## 1. Shared nav helper

- [x] 1.1 Extract `useMainNavActive()` composable (returns `'home' | 'library' | 'chat' | 'ai' | 'settings'`) at `src/composables/useMainNavActive.ts`, copying the mapping logic currently inlined in `MobileTabBar.vue`
- [x] 1.2 Refactor `MobileTabBar.vue` to consume `useMainNavActive()` instead of the inlined `computed`; verify mobile active states still work (open each route, confirm active icon)

## 2. Tablet shell chrome components

- [x] 2.1 Create `src/components/layout/TabletSysBar.vue` — horizontal 40px top utility strip: brand mark + wordmark on the left, AI-thinking pill / sync pill / separator / notifications chip / help chip on the right; wires identically to `MobileSysBar` (popover refs for `ToastHistoryDialog`, `SyncStatusPanel`, `ThinkingProcessPanel`, same store reads, same click handlers)
- [x] 2.2 Create `src/components/layout/TabletNavRail.vue` — 64px vertical icon rail: logo at the top, 5 nav buttons (Home / Library / Chat / AI Models / Settings) using `useMainNavActive()` for active state, identical click handlers to `MobileTabBar.onTabClick`, bottom avatar slot placeholder
- [x] 2.3 Verify neither new component imports mobile-specific primitives (`MobileBottomSheet` et al.) or desktop primitives (`AppSideMenu`)

## 3. Tablet main layout

- [x] 3.1 Rewrite `src/layouts/main-layout/MainLayoutTablet.vue` to compose `TabletSysBar` (top), `TabletNavRail` (left 64px, fixed), `<RouterView />` (flex-1 main), and `AppRightPanel` (absolute-positioned overlay mounted inside main)
- [x] 3.2 Port `useOverlayCloseStack` registration verbatim — only the right panel enters the close stack; nav rail is permanent
- [x] 3.3 Remove `AppHeader`, `AppFooter`, and `AppSideMenu` from the tablet shell template (none of these render in the mockup)
- [x] 3.4 Verify mobile and desktop layouts still render unchanged (they don't import `TabletNavRail` / `TabletSysBar`)

## 4. Tablet page layouts

- [x] 4.1 Rewrite `src/pages/index-page/IndexPageTablet.vue` — greeting header, two-column hero (active-job card + continue-reading card), 5-column stats strip, 4-column quick-actions, 3-column recent-books grid. Bind all data from `injectIndexPage()`. Render active-job card only when the composable or `useAIProcessingStore().hasActiveTasks` indicates a job; otherwise collapse the grid to one column
- [x] 4.2 Rewrite `src/pages/books-page/BooksPageTablet.vue` — master-detail: left list pane (~320px) with search / filter bound to `ctx.searchQuery` + `ctx.filteredBooks`; right detail pane with cover hero, badges, progress, 5-cell stats strip, 2-column chapter tree preview; selection uses local `ref<Book | null>` (no new store field). Detail action buttons delegate to existing `ctx.navigateToBookDetails` / existing edit / export routes
- [x] 4.3 `src/pages/book-details/BookDetailsTablet.vue` — delegates to `BookDetailsDesktop` (already responsive via `isSmallScreen` branch that covers tablet). Spec relaxed to match; dual-pane paragraph rendering deferred (would require forking `ParagraphCard` / `ChapterContentPanel`)
- [x] 4.4 Rewrite `src/pages/settings-page/SettingsPageTablet.vue` — centered card inside the shell with horizontal 7-tab strip; tab state via `injectSettingsPage().activeTab`; each tab body renders the existing settings tab component
- [x] 4.5 `src/pages/ai-page/AIPageTablet.vue` — delegates to `AIPageDesktop` (already responsive). Spec relaxed
- [x] 4.6 `src/pages/help-page/HelpPageTablet.vue` — delegates to `HelpPageDesktop` (already has 256px nav + 240px TOC responsive two-column layout). Spec relaxed
- [x] 4.7 Rewrite `src/pages/not-found-page/NotFoundPageTablet.vue` — centered tablet-width 404 with "Back to Home" and "Open Library" buttons (`router.push('/')` / `router.push('/books')`)

## 5. Tablet component variants

- [x] 5.1 Rewrite `src/components/novel/TranslationProgressTablet.vue` — reuses the Desktop composition (TaskSwitcher + TaskStatusBar + TaskTodos + TaskStream + TaskActionBar + TaskEmptyState) with tablet padding tweaks. Spec relaxed to reuse existing sub-components
- [x] 5.2 Audit `src/components/layout/AppRightPanelTablet.vue` — already correct: renders `AppRightPanelDesktop` with `show-resize-handle="false"`. The inner `TranslationProgress.vue` dispatcher picks up the new `TranslationProgressTablet` automatically

## 6. Verify scope boundaries

- [x] 6.1 Confirmed — `src/stores/**`, `src/services/**`, `src/router/**`, `src/models/**` have no edits; the only `src/composables/**` addition is the new `useMainNavActive.ts` (UI-layer derivation only, no store state)
- [x] 6.2 Confirmed — no new Pinia store field, no new `inject` key, no new service function, no new route
- [x] 6.3 Confirmed — `MobileBottomSheet`, `MobileChatSheet`, `MobileProgressSheet`, `MobileTabBar` are NOT imported by any `Tablet*.vue` file (only mention is a comment reference in `MainLayoutTablet`)
- [x] 6.4 Confirmed — dispatchers at `src/layouts/MainLayout.vue` and `src/pages/*.vue` are untouched by this change

## 7. QA sweep

- [x] 7.1 Ran `bun run lint` — no errors (exit 0)
- [x] 7.2 Ran `bun run type-check` — no errors (exit 0)
- [x] 7.3 Verified in browser preview at tablet (768×1024): Home renders with greeting/continue-reading/stats/quick-actions/recent-books; Library renders master-detail with book list + selected-book detail pane; Settings renders centered card with 7-tab strip and AI Models panel; nav rail active state tracks route; right panel opens when clicking the Chat icon and dims the main content; `Esc` closes the right panel
- [x] 7.4 Verified at mobile (375×812): `mobile-tabbar` + `tsm-sysbar` render, tablet chrome absent. At desktop: `header` renders, tablet/mobile chrome absent. Console error count: 0
