## Context

The app has three device classes resolved from window width (`src/constants/responsive.ts`):
- `phone`: width ≤ 767px
- `tablet`: 768–1279px
- `desktop`: ≥ 1280px

Today `useResponsiveLayout()` tracks that via the Pinia `ui.deviceType` store, and `useElectron()` tells us if we are running inside the Electron shell. The mobile redesign used `v-if="isPhone"` branches inside existing SFCs, which doubled their size: `pages/BookDetailsPage.vue` is ~4950 lines, `components/novel/TranslationProgress.vue` and `components/layout/AppRightPanel.vue` are ~1200 each, and `layouts/MainLayout.vue` interleaves three different shell layouts.

Shared logic already lives in `src/composables/book-details/` (10 composables) and `src/composables/chat/` (10 composables), so the codebase has a working pattern for per-surface composables. This change generalizes that pattern.

The proposal (see `proposal.md`) established the *what*: dispatcher + three variants per layout/page, Electron always Desktop, business logic in per-surface composables, DRY. This document fixes the *how*.

## Goals / Non-Goals

**Goals:**
- One consistent way to structure every layout and every page, so a newcomer can open any surface folder and know where the template / logic / style lives.
- Zero user-visible behavior change on web or Electron after the refactor.
- Adding a real tablet variant later = writing one template file; no logic moves.
- Dispatcher rule (Electron + breakpoints) is defined in exactly one file.
- Variant files are substantially smaller than today's combined SFCs (goal: each variant under ~800 lines for even the largest surface).

**Non-Goals:**
- Designing or implementing tablet-specific layouts.
- Changing routes, store shapes, IndexedDB schemas, AI pipelines, or i18n keys.
- Splitting leaf components (dialogs, `ParagraphCard`, `AppHeader`) whose divergence is style-only.
- Introducing SSR or route-level code-splitting as part of this change.

## Decisions

### 1. Dispatcher primitive — composable, not component

Chosen: a composable `useDeviceVariant()` that returns a computed `Ref<'desktop' | 'tablet' | 'mobile'>`.

```ts
// src/composables/useDeviceVariant.ts
import { computed } from 'vue';
import { useResponsiveLayout } from './useResponsiveLayout';
import { useElectron } from './useElectron';

export type DeviceVariant = 'desktop' | 'tablet' | 'mobile';

export function useDeviceVariant() {
  const { isPhone, isTablet } = useResponsiveLayout();
  const { isElectron } = useElectron();

  const variant = computed<DeviceVariant>(() => {
    if (isElectron.value) return 'desktop';
    if (isPhone.value) return 'mobile';
    if (isTablet.value) return 'tablet';
    return 'desktop';
  });

  return { variant };
}
```

Each dispatcher then becomes:

```vue
<script setup lang="ts">
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import Desktop from './BookDetailsDesktop.vue';
import Tablet from './BookDetailsTablet.vue';
import Mobile from './BookDetailsMobile.vue';

const { variant } = useDeviceVariant();
const variants = { desktop: Desktop, tablet: Tablet, mobile: Mobile };
</script>

<template>
  <component :is="variants[variant]" />
</template>
```

**Alternatives considered:**
- *`<DeviceVariant>` wrapper component with three slots.* Cleaner template, but forces every variant's logic/state to be defined in the parent (slot content runs in parent scope), which fights the per-surface-composable rule. Rejected.
- *Dynamic `<component :is>` with string-keyed async imports.* Would enable route-level code-splitting per variant. Out of scope for this change and would force a first-paint flash. Rejected for now — dispatcher can be refactored later without touching variants.
- *Plain if/else `v-if` chain in each dispatcher.* Copies the selection rule into every file. Violates the DRY contract. Rejected.

### 2. Electron override is reactive, not static

`useElectron().isElectron` is a `computed`. We do not snapshot it at mount time. This means if the Electron detection ever needs to react to a runtime event (it does not today, but the composable leaves the door open), dispatchers follow. Cheap to keep, no cost today.

### 3. File / folder layout

**Layouts and pages** live in a per-surface folder:

```
src/layouts/main-layout/
  MainLayout.vue              # dispatcher (kept at this name so router imports don't change)
  MainLayoutDesktop.vue
  MainLayoutTablet.vue
  MainLayoutMobile.vue

src/pages/book-details/
  BookDetailsPage.vue         # dispatcher
  BookDetailsDesktop.vue
  BookDetailsTablet.vue
  BookDetailsMobile.vue
```

The dispatcher keeps the original filename (`BookDetailsPage.vue`, `MainLayout.vue`, `IndexPage.vue`, ...) so `router/routes.ts` does not change. Router-level imports become e.g. `() => import('pages/book-details/BookDetailsPage.vue')`.

**Cross-cutting split components** keep sibling filenames (no folder change needed, they already live in typed folders):

```
src/components/novel/TranslationProgress.vue        # dispatcher
src/components/novel/TranslationProgressDesktop.vue
src/components/novel/TranslationProgressTablet.vue
src/components/novel/TranslationProgressMobile.vue
```

**Rationale for the per-surface folder on pages/layouts**: pages/layouts are the highest-leverage surfaces and will accumulate shared child components (`BookDetailsHero.vue`, `ChapterListItem.vue`, etc.). A dedicated folder gives them a home. Components that are shared across surfaces still go in `components/<category>/`.

### 4. Per-surface composable contract

Every split surface gets one "page composable" that exposes the public surface-level state and actions.

```ts
// src/composables/book-details/useBookDetailsPage.ts
export function useBookDetailsPage() {
  // state + computeds + data loading + event handlers + watchers
  return {
    book, chapters, selectedChapterId, progress, /* ... */,
    selectChapter, switchMobileTab, translateCurrentChapter, /* ... */,
  };
}
```

Variants consume it:

```vue
<script setup lang="ts">
import { useBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';

const {
  book, chapters, selectedChapterId,
  selectChapter, translateCurrentChapter,
} = useBookDetailsPage();

// Local-only UI state for THIS variant
const mobileTab = ref<'overview' | 'reader' | 'chapters'>('overview');
</script>
```

**Invocation site.** Where is the composable called — in the dispatcher, or in each variant?
- Chosen: **each variant calls the composable directly.** Variants are what actually mount; calling in the dispatcher would require prop-drilling or provide/inject, which adds noise. Because the composable reads from Pinia stores for shared state and only keeps ref/computed state scoped to the current active variant, unmounting and remounting a variant re-runs the composable but recovers state from the store — user state survives the variant swap.
- To protect this, the composable rule is explicit: **anything that must survive a variant swap lives in a Pinia store**; pure view-layer refs (a local expansion flag, an input focus ref) can live inside the composable because losing them on swap is acceptable.

### 5. Tablet variant today — re-export Desktop

Until a tablet design exists, each `*Tablet.vue` re-renders Desktop:

```vue
<!-- BookDetailsTablet.vue (placeholder) -->
<script setup lang="ts">
import BookDetailsDesktop from './BookDetailsDesktop.vue';
</script>
<template>
  <BookDetailsDesktop />
</template>
```

Rejected: `export { default } from './BookDetailsDesktop.vue'` — Vue SFC does not support re-exports directly, and it would break as soon as the tablet variant needs its own scoped styles.

Rejected: importing Desktop in the dispatcher and mapping both `desktop` and `tablet` keys to it. That works but loses the "three files exist, ready to be filled in" signal in the folder tree. The wrapper file makes the scaffolding visible to anyone opening the folder.

### 6. Shared UI fragments

When the same markup appears in 2+ variants of one surface, extract to `components/<surface>/` (if the surface is a page under `pages/<name>/`, that folder is acceptable too). Preferred location heuristic:

| Shared by | Location |
|---|---|
| Variants of the same page only | `pages/<name>/fragments/` or `components/<surface>/` |
| Variants + other pages | `components/<category>/` (existing convention) |

Enforcement is by review, not tooling. The review checklist (see §Tasks) includes "scan new variants for near-duplicate blocks."

### 7. Shared styles

- Prefer Tailwind utility classes.
- For tokens repeated across variants, use existing CSS custom properties (`--white-opacity-*`, the Tsukuyomi palette, `tsukuyomi-blue`, `night-*`, `moon-*`).
- If a new token is genuinely needed, add it to `tailwind.config.cjs` or the global CSS once, then consume by name — do not hard-code the hex in variant `<style>` blocks.
- `<style scoped>` remains allowed per variant for layout-specific rules (grid / flex / positioning that really only makes sense for that viewport).

### 8. Migration — one surface per commit

Order (chosen for de-risking):
1. `useDeviceVariant.ts` helper + a single-variant smoke test surface — `TranslationProgress`.
2. `MainLayout` — high leverage, but touches every page indirectly; landing it early lets subsequent page splits stop carrying their own phone-shell concessions.
3. `AppRightPanel` — next highest-divergence surface.
4. `BookDetailsPage` — the giant one; split in a dedicated commit (and possibly a dedicated PR for reviewability).
5. `IndexPage`, `BooksPage`, `AIPage`, `HelpPage`, `NotFoundPage` — remaining pages, can be one commit each or grouped if trivial.

Every commit is independently revertable. Each commit must pass `bun run lint && bun run type-check`. Each commit includes a manual smoke-test note: phone viewport (Chrome DevTools), desktop viewport, Electron dev window resized below the phone breakpoint.

### 9. Testing stance

This is a structural refactor with no behavior change. We rely on:
- **Type-check** to catch broken imports/props.
- **Lint** to catch unused imports and dead branches.
- **Manual smoke tests** per surface (phone + desktop + Electron-resize) before each commit.
- **Existing unit tests** in `src/__tests__/` — they target services and stores, which this change does not touch, so they should remain green throughout.

No new automated tests are planned for the dispatcher itself — its logic is four lines of conditionals that type-checking covers. If the helper ever grows complexity, a Bun test against `useDeviceVariant()` can be added.

## Risks / Trade-offs

- **[Logic drift during extraction]** When moving state/handlers from a giant SFC into a composable, it is easy to miss a closure over a local ref, a watcher that depended on component lifecycle, or an implicit `this`. → Mitigation: extract logic in the same commit as the split, diff carefully, rely on type-check; keep each commit small enough to re-read end-to-end.
- **[Variant swap resets local state]** Any ref declared inside a variant (not in the composable / store) is lost on breakpoint swap. → Mitigation: composable rule in §4; variant-local state is only for ephemeral UI flags that resetting is acceptable for.
- **[Folder churn for imports]** Moving `BookDetailsPage.vue` into `pages/book-details/` changes import paths for anything that imports the page directly. → Mitigation: the router is the only consumer of these page paths (verified); update `router/routes.ts` in the same commit as the split. For cross-cutting components (`TranslationProgress`, `AppRightPanel`) the file stays in place.
- **[Tablet scaffold rot]** If Tablet variants sit as placeholder re-exports for months, they can drift out of sync or be forgotten. → Mitigation: acceptable — the placeholder file is 3 lines and hard to break; the follow-up change that designs tablet layouts is the owner of keeping them honest.
- **[Dispatcher extra render frame]** Using `<component :is>` with three candidate components adds one dynamic-component resolution vs. a direct `<Desktop />` mount. → Trade-off accepted; in practice the penalty is negligible and happens once per page load.
- **[`useElectron()` returns computed, not static]** Minor overhead; more importantly it couples the dispatcher to Vue reactivity even in Electron where the value never changes. → Trade-off accepted; unifying on the composable keeps the code simple.

## Migration Plan

Deployment is per-commit; no data migration, no version gates. If any surface regresses, revert that commit. The `useDeviceVariant.ts` helper commit is safe to revert last — it has no consumers until a dispatcher imports it.

No rollback strategy is needed beyond `git revert`.

## Open Questions

- **Shared UI fragments for `BookDetailsPage`** — we do not yet have a full inventory of which blocks appear in both the desktop and mobile templates. Answer by doing: during the `BookDetailsPage` split commit, extract any 2+-variant duplication as child components under `pages/book-details/fragments/` (or reuse `components/novel/`). Document what was extracted in the commit message.
- **`NotFoundPage` triviality** — right now Desktop / Tablet / Mobile are literally identical. Do we still ship three files or do we ship a dispatcher that always mounts `NotFoundPageDesktop.vue`? Proposed resolution: ship all three (proposal rule), each as a 3-line re-export of Desktop, until design diverges. Cost is 6 lines of scaffolding for forward consistency.
- **Follow-up scope for dialogs** — `NovelScraperDialog` has ~30 `isPhone` conditionals in its script. It sits just above the leaf-component threshold. A separate change may split it once we want a tablet dialog layout; out of scope here.
