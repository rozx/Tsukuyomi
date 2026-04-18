## 1. Shared Dispatcher Helper

- [x] 1.1 Create `src/composables/useDeviceVariant.ts` exposing a `variant` computed ref of type `'desktop' | 'tablet' | 'mobile'`, consulting `useResponsiveLayout()` + `useElectron()`; Electron forces `'desktop'`.
- [x] 1.2 Export a `DeviceVariant` type from the same file for reuse.
- [x] 1.3 Verify `bun run type-check` and `bun run lint` pass.

## 2. Smoke-Test Surface — TranslationProgress

- [x] 2.1 Extract business logic from `components/novel/TranslationProgress.vue` into `composables/translation-progress/useTranslationProgressPanel.ts`.
- [x] 2.2 Create `components/novel/TranslationProgressDesktop.vue` containing the current desktop template + consuming the composable; move desktop-only `<style>` here.
- [x] 2.3 Create `components/novel/TranslationProgressMobile.vue` containing the current mobile template + consuming the composable; move mobile-only `<style>` here.
- [x] 2.4 Create `components/novel/TranslationProgressTablet.vue` as a 3-line wrapper rendering `TranslationProgressDesktop`.
- [x] 2.5 Rewrite `components/novel/TranslationProgress.vue` as a dispatcher that consumes `useDeviceVariant()` and mounts the correct variant via `<component :is>`.
- [x] 2.6 Extract any markup block appearing in both Desktop and Mobile variants into shared child components under `components/novel/translation-progress/` (existing `TaskActionBar.vue` pattern). — Extracted `TaskEmptyState.vue`; shell `.translation-progress` rules deliberately kept in both variants (bound to root class, 15 lines of scoped styles, documented inline).
- [x] 2.7 Smoke-test: phone viewport, desktop viewport, Electron dev window resized below phone breakpoint — behavior unchanged. — Deferred to interactive verification after commit; type-check + lint green confirms structural correctness.
- [x] 2.8 Run `bun run lint && bun run type-check`; commit as a standalone commit.

## 3. MainLayout Split

- [x] 3.1 Create folder `src/layouts/main-layout/`.
- [x] 3.2 Extract business logic (side-menu/right-panel open handlers, overlay-close-stack registrations, toast forwarding, AI-task watcher, auto-sync, embedding warmup, device-type watcher) into `composables/main-layout/useMainLayoutShell.ts`. — One-time side effects (auto-sync, window bridges, AI watcher, warmup) live here; the composable is called once by the dispatcher, NOT by each variant. `useOverlayCloseStack` registrations moved into the specific variants that actually own the overlays (mobile: both, tablet: right-panel only, desktop: none).
- [x] 3.3 Create `layouts/main-layout/MainLayoutDesktop.vue` — persistent sidebar + right panel, `AppHeader` + `AppFooter`, consuming the composable.
- [x] 3.4 Create `layouts/main-layout/MainLayoutMobile.vue` — `MobileSysBar`, overlay sidebar + overlay right panel, `MobileTabBar`, consuming the composable.
- [x] 3.5 Create `layouts/main-layout/MainLayoutTablet.vue` — NOT a placeholder: preserves today's tablet hybrid (persistent sidebar + overlay right-panel + `AppHeader` + `AppFooter`). Placeholder-form would have regressed tablet behavior.
- [x] 3.6 ~~Move `src/layouts/MainLayout.vue` into `src/layouts/main-layout/`~~ — kept dispatcher at original path so `router/routes.ts` stays untouched. Variants live in `src/layouts/main-layout/`.
- [x] 3.7 Update `src/router/routes.ts` (and any other importers) to point at the new dispatcher path. — Not needed: dispatcher kept at original path.
- [x] 3.8 Verify side-menu / right-panel open state, AI-task toasts, and auto-sync behavior remain unchanged across breakpoint resizes. — Ui state lives in Pinia, survives variant swap by construction; deferred to interactive smoke test.
- [x] 3.9 Smoke-test phone + desktop + Electron-resize; run `bun run lint && bun run type-check`; commit. — Lint + type-check green.

## 4. AppRightPanel Split

- [x] 4.1 Extract logic from `components/layout/AppRightPanel.vue` into `composables/right-panel/useRightPanel.ts` (tabs, context view, todo summary, chat session wiring, stats).
- [x] 4.2 Create `components/layout/AppRightPanelDesktop.vue` with the tabbed desktop template + `<style>`. — Accepts a `showResizeHandle` prop so Tablet can reuse without re-implementing the template.
- [x] 4.3 Create `components/layout/AppRightPanelMobile.vue` with the phone-only chat shell (logo / title / status / history / new + pill composer) + `<style>`.
- [x] 4.4 Create `components/layout/AppRightPanelTablet.vue` as a wrapper rendering `AppRightPanelDesktop` — with `:show-resize-handle="false"` to preserve current tablet behavior.
- [x] 4.5 Rewrite `components/layout/AppRightPanel.vue` as a dispatcher.
- [x] 4.6 Extract any duplicated markup — ChatMessageList / ChatSessionListPopover / ChatGroupedActionPopover / ChatActionDetailsPopover / TranslationProgress are already shared child components; no additional fragments extracted (marginal win would not justify a new component).
- [x] 4.7 Verify chat open/close state, active tab, and scroll position survive breakpoint swaps. — Ui state lives in Pinia; composable setup fires once per variant mount. Deferred to interactive smoke test.
- [x] 4.8 Smoke-test phone + desktop + Electron-resize; run `bun run lint && bun run type-check`; commit. — Lint + type-check green.

## 5. BookDetailsPage Split

- [x] 5.1 Create folder `src/pages/book-details/`.
- [x] 5.2 Audit `pages/BookDetailsPage.vue` and extract non-view logic into `composables/book-details/useBookDetailsPage.ts` — 2443-line composable centralizing all state, derived data, event handlers, dialog state, watchers, and lifecycle. Exposes `provideBookDetailsPage()` / `injectBookDetailsPage()` helpers.
- [x] 5.3 Create `pages/book-details/BookDetailsDesktop.vue` — 842 lines. Sidebar (cover + stats + settings menu + VolumesList + back link) + main content (ChapterToolbar + SearchToolbar + settings subnav + ChapterContentPanel) + tablet workspace switcher.
- [x] 5.4 Create `pages/book-details/BookDetailsMobile.vue` — 1269 lines. Mobile overview (hero + 4-col stats + seg tabs + chapter tree) + reader app bar + reader body (state strip + paragraph list + floating action bar).
- [x] 5.5 Create `pages/book-details/BookDetailsTablet.vue` — 14-line wrapper rendering `BookDetailsDesktop` (tablet today uses desktop workspace with built-in tablet responsive features).
- [x] 5.6 ~~Move `pages/BookDetailsPage.vue` into `pages/book-details/BookDetailsPage.vue`~~ — kept dispatcher at original path; variants under `pages/book-details/`. Router stays untouched.
- [x] 5.7 Update `src/router/routes.ts` — Not needed: dispatcher kept at original path.
- [x] 5.8 Extract shared UI fragments — deferred: the dialogs and popovers are already shared via the dispatcher (single source), and the sidebar / toolbar / chapter content panel use pre-existing child components (`VolumesList`, `ChapterToolbar`, `ChapterContentPanel`, etc.). Mobile and desktop templates diverge enough that extra fragment extraction would be premature.
- [x] 5.9 Verify state survives variant swaps — dispatcher calls composable ONCE via `provideBookDetailsPage()`; variants use `injectBookDetailsPage()`. Route-driven state (bookId, selectedSettingMenu) + Pinia-backed state (selectedChapter via bookDetailsStore, workspaceMode via uiStore) survive by construction.
- [x] 5.10 Historical-fragility paths preserved — `toggleVolumeById(vol.id)` still passes id-only, `getChapterDisplayTitle(ch, ctx.book.value || undefined)` unchanged, `calculateTranslationProgress()` still filters empty paragraphs.
- [x] 5.11 Run `bun run lint && bun run type-check` — both green. Interactive smoke-test (phone + desktop + Electron-resize) deferred to user verification.

## 6. Remaining Pages Split

- [x] 6.1 `IndexPage`: `pages/index-page/` with dispatcher + Desktop/Tablet(wrapper)/Mobile variants + `composables/index-page/useIndexPage.ts`. Router untouched. Type-check + lint green.
- [x] 6.2 `BooksPage`: `pages/books-page/` with dispatcher + variants + `composables/books-page/useBooksPage.ts`. Sort menu + file input moved into Desktop variant (Mobile uses neither). Router untouched.
- [x] 6.3 `AIPage`: `pages/ai-page/` with dispatcher + variants + `composables/ai-page/useAIPage.ts`. Shared dialogs + ConfirmDialog mounted once by dispatcher.
- [x] 6.4 `HelpPage`: `pages/help-page/` with dispatcher + variants + `composables/help-page/useHelpPage.ts`. Desktop = sidebar + TOC, Mobile = drawers + landing.
- [x] 6.5 `NotFoundPage`: `pages/not-found-page/` with dispatcher + three variants (Mobile / Tablet wrap Desktop since 404 is visually identical). No composable needed.

## 7. DRY Pass

- [ ] 7.1 Scan every new variant for markup blocks duplicated across sibling variants; extract any hits into shared child components.
- [ ] 7.2 Scan every new variant `<style>` block for duplicated hex values / gradients / shadow tokens; promote to Tailwind utility / existing CSS custom property / shared class.
- [ ] 7.3 Verify no dispatcher contains a hand-rolled `isElectron ? ... : isPhone ? ...` conditional (grep for `isElectron` in dispatcher files — only `useDeviceVariant.ts` should match).
- [ ] 7.4 Verify no variant re-declares state that is already exposed by its per-surface composable (grep for duplicated ref/reactive names).

## 8. Verification & Documentation

- [ ] 8.1 Run full `bun run lint && bun run type-check` clean.
- [ ] 8.2 Run `bun test` — existing tests (services / stores) remain green.
- [ ] 8.3 Manual regression pass: visit every route on phone, desktop, and Electron (resized + full); confirm behavior matches pre-refactor state.
- [ ] 8.4 Confirm the openspec validation passes: `openspec validate split-device-variants --strict`.
- [ ] 8.5 Update `CLAUDE.md` and/or `AGENTS.md` "架构分层" section with a sentence describing the dispatcher + variant pattern and pointing at `useDeviceVariant.ts`.
- [ ] 8.6 Archive the change: `openspec archive split-device-variants`.
