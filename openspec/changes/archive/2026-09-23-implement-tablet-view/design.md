## Context

Tsukuyomi has three device variants (`'desktop' | 'tablet' | 'mobile'`) resolved by [`useDeviceVariant()`](src/composables/useDeviceVariant.ts). Today only `desktop` and `mobile` have real implementations: every `*Tablet.vue` file under `src/layouts/main-layout/` and `src/pages/*/` is a 3-line pass-through re-rendering the desktop variant. That means tablet users see a 1280px-class desktop chrome jammed into a 900–1200px viewport — the full 16rem `AppSideMenu`, the desktop `AppHeader`, desktop-density cards — with no affordances tuned for touch or for the horizontal real estate actually available.

A Claude Design handoff bundle extracted at `/tmp/design-tsukuyomi/project-tsukuyomi/` ships the visual spec. The key mockup files are:

- `project/tablet.jsx` — Reader and master-detail Library tablet layouts.
- `project/tablet-more.jsx` — Home dashboard, three-pane Chat, centered Settings modal, right-docked Translation Progress.
- `project/mobile.css` — design tokens (colors, spacing, typography, `.tsm-*` utility classes) already mirrored in the project's Tailwind theme + `src/css/`.

The mockup's mental model is: `TabletSysBar` (top) + `TabletNavRail` (left 64px) + content area (fluid). Page templates inside the content area vary — some are master-detail (Library), some are split-pane (Reader), some float a centered modal (Settings). The mockup's Chat surface lives inside the right-panel overlay, not the main content area.

Constraints:

- The dispatcher pattern (one dispatcher per page that picks a variant via `useDeviceVariant`) is mandatory per [CLAUDE.md](CLAUDE.md#设备变体规则dispatcher--desktoptabletmobile); tablet implementation MUST plug into that, not work around it.
- The mockup is a *visual* prototype, not a feature spec. Mobile + desktop variants are the feature-availability reference — anything the mockup shows that isn't wired in either variant is purely static presentation.
- Existing `AppRightPanelTablet.vue` + `TranslationProgressTablet.vue` exist today but are either placeholders or desktop copies; they need to be filled in per the mockup.

## Goals / Non-Goals

**Goals:**

- Give tablet viewports a native-density shell (nav rail + top utility strip) that replaces the compressed desktop shell.
- Rewrite every `*Tablet.vue` page to render per the mockup's layout while consuming the same composables / stores the mobile variants already consume.
- Bring `TranslationProgressTablet` up to the right-dock design in the mockup.
- Keep dispatchers, routes, stores, services, and composables untouched — no business-logic drift.

**Non-Goals:**

- No new Pinia store fields, no new composables, no new service methods, no AI / translation / sync pipeline changes.
- No redesign of dialogs, popovers, or bottom sheets that already work correctly across variants (`AdaptiveDialog` already branches correctly).
- No Chat-specific tablet page — the mockup's three-pane Chat is rendered inside the existing right-panel overlay, not as a dedicated route.
- No changes to responsive breakpoints in `useResponsiveLayout` / `useDeviceVariant`.
- No changes to mobile variants or desktop variants.

## Decisions

### Decision 1: Two new tablet-only shell components (`TabletNavRail` + `TabletSysBar`) instead of flex-responsive versions of the desktop/mobile equivalents

`MobileSysBar` is built around a 32px-tall phone strip with icon-only chips. `AppHeader` (desktop) is a chunkier header with router-level title and breadcrumb logic. Neither scales cleanly to the tablet design, which wants a 40px-tall horizontal bar that mirrors `MobileSysBar`'s affordances (AI thinking / sync / notifications / help) but at tablet padding. Similarly, `AppSideMenu` is a 16rem expandable sidebar with text labels; the mockup's tablet rail is a fixed 64px icon-only rail with no expand state.

Rather than fork mobile/desktop components with `v-if="isTablet"` branches (an anti-pattern per the project's variant rule), we add two dedicated components that live in `src/components/layout/` next to their mobile/desktop siblings:

- `TabletSysBar.vue` — composes the same store reads as `MobileSysBar` (sync state, thinking state, unread toasts) but with horizontal tablet spacing. Reuses the same popover components (`ToastHistoryDialog`, `SyncStatusPanel`, `ThinkingProcessPanel`) — they already render correctly at tablet size.
- `TabletNavRail.vue` — a vertical icon rail whose click handlers are a copy of `MobileTabBar`'s logic. Active-tab detection is literal reuse (same `computed` that `MobileTabBar` uses, not a new derivation).

**Alternatives considered:**

- *Make `MobileSysBar` responsive with a CSS grid that widens at tablet breakpoint.* Rejected: it still ships mobile-specific tap targets and wouldn't integrate with the nav rail's vertical rhythm. The project explicitly forbids `v-if="isPhone"` branches in shared components.
- *Make `TabletNavRail` reuse `AppSideMenu` at a fixed collapsed width.* Rejected: `AppSideMenu` isn't built for permanent-collapsed — its internal state assumes expand-on-hover, and its nav items include text-only affordances that would become floating tooltips. Too much surgery on a component used by desktop.

### Decision 2: `MainLayoutTablet` keeps `AppRightPanel` as the right-side overlay — no new right-dock primitive

The mockup shows Translation Progress as a 420px right-docked panel above the reader. This is exactly what `AppRightPanel` + `AppRightPanelTablet` already do — an absolutely positioned overlay controlled by `ui.rightPanelOpen`. We keep that wiring. What changes:

- The *shell* around `AppRightPanel` moves from desktop-header + sidebar to tablet-sysbar + nav-rail. The panel itself keeps its existing container, transforms, and `useOverlayCloseStack` integration.
- `TranslationProgressTablet.vue` (rendered *inside* `AppRightPanelTablet` when `ui.activeRightTab === 'progress'`) gets a fresh template matching the mockup.

**Alternatives considered:**

- *Introduce a `TabletDockPanel` as a separate primitive.* Rejected: it would duplicate the overlay close-stack, right-panel-width state, and drag-resize logic already in `AppRightPanel`. The current abstraction fits.

### Decision 3: Tablet pages render the *same* composables as mobile, not as desktop

Every mobile page variant already uses a dedicated composable (`injectIndexPage`, `injectBooksPage`, `injectBookDetailsPage`, `injectAIPage`, `injectSettingsPage`, `injectHelpPage`) that wraps the stores with a view-oriented API. Desktop uses the same composables. Tablet will too — the tablet variants inject the exact same helpers the mobile variants use, and will call only methods that already exist on those helpers.

Where the mockup shows a data point that's not currently exposed (e.g., batch-translation ETA, per-model sim scores), the tablet variant either renders a static placeholder (to match the visual rhythm) or omits the block entirely. This keeps the mockup honest as a *visual* spec while avoiding feature creep.

**Alternatives considered:**

- *Extend composables to expose new selectors the mockup implies.* Rejected: this is a design-implementation change, not a feature change. If ETA etc. become real features later, they'll land in separate changes with their own specs.

### Decision 4: Settings page uses a router-driven tab state, not local component state

`SettingsPage` already has a path-level notion of tab selection (used by BookDetails sub-routes like `/books/:id/settings/terms`). The mockup's centered modal shows a horizontal tab strip — we'll drive it via the same `ui` or `settings-page` composable state that the desktop + mobile variants already use (hash fragment or `injectSettingsPage().activeTab`). No new route.

If the current composable doesn't expose an `activeTab`, we'll use a local `ref<'ai-models' | 'proxy' | ...>('ai-models')` scoped to the tablet variant — local UI state only, no shared store field.

**Alternatives considered:**

- *Add a new query param for the settings tab.* Rejected: routing changes are out of scope.

### Decision 5: No Chat page; Chat remains inside `AppRightPanelTablet`

The mockup's Chat-with-context three-pane screen is rendered inside the right-panel overlay. We keep the current behavior: `AppRightPanelTablet` renders Chat when `ui.activeRightTab === 'chat'`. The nav rail's Chat icon toggles `ui.activeRightTab` + `ui.rightPanelOpen`, mirroring `MobileTabBar`'s Chat logic.

### Decision 6: Do not touch `AdaptiveDialog`, `MobileBottomSheet`, or any `*Popover` component

`AdaptiveDialog` already picks the right primitive (desktop `Dialog` vs mobile bottom-sheet) per device. `MobileBottomSheet` is only mounted inside mobile layouts. Popovers (PrimeVue) render identically on tablet and desktop. This change does not touch them — if the mockup appears to show a bottom-sheet-like surface on tablet, the project's device-variant rule (tablet inherits desktop for bottom-sheet surfaces unless designed otherwise) wins.

### Decision 7: Tablet nav rail active-tab logic lives in a small exported `computed` helper, not duplicated

`MobileTabBar`'s active-tab `computed` already has the canonical mapping from route / `ui.activeRightTab` → active tab id. To avoid drift, we can either:

1. Export that computed from a shared file (e.g., `src/composables/useMainNav.ts`) and have both `MobileTabBar` and `TabletNavRail` consume it, OR
2. Literally copy the 10-line computed into `TabletNavRail` and rely on code review to keep them in sync.

We'll go with **option 1** — extract a tiny `useMainNavActive()` composable that returns the active tab id given the current route + ui state. This is a refactor internal to UI layer and doesn't add store state. If that refactor feels like scope creep during implementation, fall back to option 2 (direct copy, flagged with a comment).

## Risks / Trade-offs

- **[Risk]** Breaking `useOverlayCloseStack` wiring when rewriting `MainLayoutTablet` → users can't dismiss the right panel with `Esc`. **Mitigation:** the existing `MainLayoutTablet` already registers only the right panel in the close stack; new layout mirrors that exact registration (same `computed` predicates, same `onClose` handler).

- **[Risk]** Nav rail active-tab logic drifts from `MobileTabBar` → tablet users see stale active states when opening chat from the rail. **Mitigation:** extract active-tab `computed` into a shared composable (Decision 7), tested indirectly by the fact that both nav surfaces consume it.

- **[Risk]** Tablet right panel overlap with new nav rail → rail icons get hidden behind the panel when it opens. **Mitigation:** the right panel's `position: absolute; right: 0` lives inside `main`, which starts after the rail. The rail sits outside that container. No overlap possible.

- **[Risk]** `BookDetailsTablet` dual-pane rendering explodes memory on long chapters → real tablets have less RAM than desktops. **Mitigation:** reuse the existing `ChapterContentPanel` paragraph rendering that already handles virtualization; don't invent a new list component. Visible-only rendering is already in place via `ParagraphCard`.

- **[Risk]** Mockup shows data not wired (ETA, sim scores, per-model stats) and users expect it to work → confusion. **Mitigation:** explicit rule in specs — use static placeholders or omit. Surface a `TODO` comment only where a real selector is missing so later changes can fill in.

- **[Trade-off]** Adding `TabletSysBar` + `TabletNavRail` as dedicated components means ~2× the CSS surface area for the utility strip / nav (vs a single responsive component). We accept this cost because the project's variant rule explicitly prefers dedicated variants over internal `v-if="isTablet"` branches.

## Migration Plan

No data / storage / API migration. This is a pure UI refactor of the tablet variant files. Rollout:

1. Land the two new chrome components (`TabletNavRail`, `TabletSysBar`) in isolation.
2. Rewrite `MainLayoutTablet` to use them; verify mobile + desktop still render (they don't import these new files).
3. Rewrite pages one-by-one (IndexPage → BooksPage → BookDetails → Settings → AI → Help → NotFound).
4. Rewrite `TranslationProgressTablet` + audit `AppRightPanelTablet`.
5. Run `bun run lint && bun run type-check` after each step (mandatory per CLAUDE.md).

Rollback: `git revert` the commit range. No persisted state changes, so no data cleanup needed.

## Open Questions

- **Q1:** Does `injectSettingsPage()` currently expose an `activeTab` ref, or is tab state managed via route hash? Will check during tasks phase — if neither, use local state (per Decision 4).
- **Q2:** Should the nav rail include a Reader affordance (icon goes back to the most recent book) or is "Library → tap book" enough? The mockup shows a Reader icon as a rail item, but mobile doesn't have one. **Resolution:** keep it to the 5 items `MobileTabBar` exposes (Home / Library / Chat / AI Models / Settings) to preserve navigation parity. Revisit if the user asks for a Reader shortcut.
- **Q3:** Should tablet reuse `useMainNavActive()` as a brand-new composable, or can we fold it into an existing one? **Resolution:** defer to implementation; small enough that either path is acceptable.
