## 1. Shared desktop workbench primitives

- [x] 1.1 Audit desktop-only visual duplication across `MainLayoutDesktop.vue`, `BooksPageDesktop.vue`, `BookDetailsDesktop.vue`, `SettingsPageDesktop.vue`, `AIPageDesktop.vue`, and `HelpPageDesktop.vue`, then define the minimal shared desktop workbench primitives needed
- [x] 1.2 Implement the shared desktop presentation primitives without introducing new store state, service logic, or route changes
- [x] 1.3 Verify the shared primitives affect only desktop variants and do not alter mobile/tablet render paths

## 2. Desktop shell chrome

- [x] 2.1 Refresh `src/layouts/main-layout/MainLayoutDesktop.vue` canvas spacing and shell layering while preserving the existing `AppHeader`, `AppSideMenu`, `AppRightPanel`, `ui.sideMenuOpen`, `ui.rightPanelOpen`, and `ui.rightPanelWidth` behavior
- [x] 2.2 Update `src/components/layout/AppHeader.vue` to match the new desktop workbench hierarchy while keeping existing sync, notification, AI-thinking, embeddings, side-menu toggle, and right-panel toggle flows intact
- [x] 2.3 Update `src/components/layout/AppSideMenu.vue` navigation sections, active states, and favorites area to match the new desktop shell language without changing routes or starred-book behavior
- [x] 2.4 Refresh `src/components/layout/AppRightPanelDesktop.vue` surface and header/tabs hierarchy so the chat/progress panel feels integrated with the desktop shell without changing panel functionality or resize behavior

## 3. Desktop library workbench

- [x] 3.1 Rewrite `src/pages/books-page/BooksPageDesktop.vue` header into a desktop workbench title area with eyebrow, summary, metrics, and the existing search/sort/add controls
- [x] 3.2 Redesign the desktop book card hierarchy to be cover-first, quieter in metadata, and still support direct favorite/edit/delete actions using the existing `injectBooksPage()` methods
- [x] 3.3 Preserve DataView pagination, multi-column density, loading state, and empty state behaviors while aligning their surfaces with the new desktop workbench language

## 4. Desktop book details workspace

- [x] 4.1 Rework the left sidebar structure in `src/pages/book-details/BookDetailsDesktop.vue` into clearer sections for book overview, setting shortcuts, catalog tools, chapter tree, and return action while preserving existing methods and drag/drop behavior
- [x] 4.2 Reorganize the desktop chapter toolbar and surrounding content container so chapter identity, primary translation actions, and secondary tools are visually layered without replacing current toolbar logic
- [x] 4.3 Refresh the desktop settings-context containers for terminology, character, and memory management so they feel like alternate workbench contexts of the same page instead of detached utility screens
- [x] 4.4 Validate that switching between reading and settings contexts keeps the current book route and sidebar context intact on desktop

## 5. Desktop tool pages

- [x] 5.1 Replace the current `src/pages/settings-page/SettingsPageDesktop.vue` tablet pass-through with a dedicated desktop settings page that reuses `injectSettingsPage()` state and the existing tab content components
- [x] 5.2 Redesign `src/pages/ai-page/AIPageDesktop.vue` to share the desktop tool-page grammar while preserving current search, add, duplicate, edit, delete, grouping, and task-routing behaviors
- [x] 5.3 Verify `SettingsPageDesktop` and `AIPageDesktop` share the same desktop title/section grammar without introducing desktop-only state management

## 6. Desktop help center

- [ ] 6.1 Extend `src/pages/help-page/HelpPageDesktop.vue` with a branded desktop landing state for `currentDoc === null`, reusing the quick-start and topic-entry ideas at desktop density
- [ ] 6.2 Refresh the desktop help navigation, TOC, and article header hierarchy so selected-document reading remains a multi-column workspace with clearer product-level visual structure
- [ ] 6.3 Verify desktop help keeps topic navigation and TOC directly reachable alongside article content and does not regress mobile/tablet help behavior

## 7. Verification

- [ ] 7.1 Run `bun run lint`
- [ ] 7.2 Run `bun run type-check`
- [ ] 7.3 Run `bun run quality-check`
- [ ] 7.4 Manually verify desktop variants for `MainLayout`, `BooksPage`, `BookDetailsPage`, `SettingsPage`, `AIPage`, and `HelpPage`, and confirm mobile/tablet variants remain visually and functionally unchanged
