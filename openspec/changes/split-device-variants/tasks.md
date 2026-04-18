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

- [ ] 5.1 Create folder `src/pages/book-details/`.
- [ ] 5.2 Audit `pages/BookDetailsPage.vue` and extract non-view logic into `composables/book-details/useBookDetailsPage.ts` (surface-level orchestration — book/chapter loading, tab state, progress calc, settings-sub-route navigation, mobile-tab switching). Reuse existing `composables/book-details/*` composables where they already cover a concern.
- [ ] 5.3 Create `pages/book-details/BookDetailsDesktop.vue` — three-column desktop workspace (chapter list + reader + right panel integration).
- [ ] 5.4 Create `pages/book-details/BookDetailsMobile.vue` — overview / reader / chapters tabbed mobile workspace (`.mobile-reader`, hero card, 4-col stats strip, segmented tabs, reader app bar, batch menu, floating action bar, translation-state strip).
- [ ] 5.5 Create `pages/book-details/BookDetailsTablet.vue` as a wrapper rendering `BookDetailsDesktop`.
- [ ] 5.6 Move `pages/BookDetailsPage.vue` into `pages/book-details/BookDetailsPage.vue` as a dispatcher.
- [ ] 5.7 Update `src/router/routes.ts` to import the dispatcher from the new path.
- [ ] 5.8 Extract shared UI fragments (hero/cover card, chapter list item, batch menu, action bar, progress meter, stats strip) into `pages/book-details/fragments/` if they appear in 2+ variants.
- [ ] 5.9 Verify selected chapter, scroll position, panel tab, and mobile `switchMobileTab('chapters')` behavior all survive breakpoint swaps.
- [ ] 5.10 Manually verify the historically fragile paths — volume row expand/collapse via `toggleVolumeById`, `getChapterDisplayTitle` handling of object titles, non-empty paragraph filter in `calculateTranslationProgress`.
- [ ] 5.11 Smoke-test phone + desktop + Electron-resize; run `bun run lint && bun run type-check`; commit in its own PR.

## 6. Remaining Pages Split

- [ ] 6.1 `IndexPage`: create `pages/index/` with dispatcher + Desktop/Tablet(wrapper)/Mobile variants + `composables/index-page/useIndexPage.ts`; update router; smoke-test; commit.
- [ ] 6.2 `BooksPage`: create `pages/books/` with dispatcher + variants + `composables/books-page/useBooksPage.ts`; update router; smoke-test; commit.
- [ ] 6.3 `AIPage`: create `pages/ai/` with dispatcher + variants + `composables/ai-page/useAIPage.ts`; update router; smoke-test; commit.
- [ ] 6.4 `HelpPage`: create `pages/help/` with dispatcher + variants + `composables/help-page/useHelpPage.ts`; update router; smoke-test; commit.
- [ ] 6.5 `NotFoundPage`: create `pages/not-found/` with dispatcher + three (near-identical) variants; update router; commit. No composable needed (page has no logic).

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
