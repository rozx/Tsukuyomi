## 1. Shared desktop workbench primitives

- [ ] 1.1 Audit current desktop-only visual duplication across `MainLayoutDesktop.vue`, `BooksPageDesktop.vue`, `BookDetailsDesktop.vue`, `SettingsPageDesktop.vue`, `AIPageDesktop.vue`, and `HelpPageDesktop.vue`, then decide the minimal shared desktop primitives needed (for example title/header fragment, section surface classes, metric/meta strip styles)
- [ ] 1.2 Implement the shared desktop presentation primitives without introducing new store state, service logic, or route changes
- [ ] 1.3 Verify the shared primitives are desktop-focused only and do not alter mobile/tablet variants

## 2. Desktop shell chrome

- [ ] 2.1 Redesign `src/layouts/main-layout/MainLayoutDesktop.vue` main canvas spacing and shell layering while preserving the existing `AppHeader`, `AppSideMenu`, `AppRightPanel`, `ui.sideMenuOpen`, `ui.rightPanelOpen`, and `ui.rightPanelWidth` behavior
- [ ] 2.2 Refresh `src/components/layout/AppHeader.vue` to align with the new desktop workbench hierarchy, keeping existing sync, toast, AI-thinking, embeddings, side-menu toggle, and right-panel toggle behaviors intact
- [ ] 2.3 Refresh `src/components/layout/AppSideMenu.vue` to use clearer desktop sections, more consistent active states, and a calmer favorites area while preserving all existing routes and starred-book entry behavior
- [ ] 2.4 Refresh `src/components/layout/AppRightPanelDesktop.vue` surfaces and tab header styling so the chat/progress panel reads as part of the same desktop shell without changing panel functionality or resize behavior

## 3. Desktop library workbench

- [ ] 3.1 Rewrite `src/pages/books-page/BooksPageDesktop.vue` header into a workbench title area with eyebrow, title, summary, metrics, and the existing search/sort/add controls
- [ ] 3.2 Redesign the desktop book card hierarchy to be cover-first, quieter in metadata, and still support direct favorite/edit/delete actions using existing `injectBooksPage()` methods
- [ ] 3.3 Preserve DataView pagination, multi-column density, loading state, and empty state behaviors while aligning their surfaces with the new desktop workbench language

## 4. Desktop book details workspace

- [ ] 4.1 Rework the left sidebar structure in `src/pages/book-details/BookDetailsDesktop.vue` into clearer sections for book overview, setting shortcuts, catalog tools, chapter tree, and return action while preserving existing methods and drag/drop behavior
- [ ] 4.2 Reorganize the desktop chapter toolbar and surrounding content container so chapter identity, primary translation actions, and secondary tools are visually layered without replacing current toolbar logic
- [ ] 4.3 Refresh the desktop settings-context views (`TerminologyPanel`, `CharacterSettingPanel`, `MemoryPanel` container treatment) so they feel like alternate workbench contexts of the same page instead of detached utility screens

## 5. Desktop tool pages

- [ ] 5.1 Replace the current `src/pages/settings-page/SettingsPageDesktop.vue` tablet pass-through with a dedicated desktop settings page that reuses `injectSettingsPage()` state and the existing tab content components
- [ ] 5.2 Redesign `src/pages/ai-page/AIPageDesktop.vue` to match the new desktop tool-page syntax while preserving current search, add, duplicate, edit, delete, grouping, and task-routing behaviors
- [ ] 5.3 Verify `SettingsPageDesktop` and `AIPageDesktop` share the same desktop title/section grammar without introducing new desktop-only state management

## 6. Desktop help center

- [ ] 6.1 Extend `src/pages/help-page/HelpPageDesktop.vue` with a branded desktop landing state for `currentDoc === null`, reusing the spirit of the existing mobile help landing content at desktop density
- [ ] 6.2 Refresh the desktop help navigation, TOC, and article header hierarchy so selected-document reading remains a multi-column workspace with clearer product-level visual structure
- [ ] 6.3 Verify desktop help keeps topic navigation and TOC directly reachable alongside article content and does not regress mobile/tablet help behavior

## 7. Verification

- [ ] 7.1 Run `bun run lint`
- [ ] 7.2 Run `bun run type-check`
- [ ] 7.3 Run `bun run quality-check`
- [ ] 7.4 Manually verify desktop variants for `MainLayout`, `BooksPage`, `BookDetailsPage`, `SettingsPage`, `AIPage`, and `HelpPage`, and confirm mobile/tablet variants remain visually and functionally unchanged
