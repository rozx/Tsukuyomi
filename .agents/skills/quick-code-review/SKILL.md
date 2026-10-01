---
name: quick-code-review
description: Quick checklist review of the active files, files the user names, or recent uncommitted changes in this repo — runs lint / type-check / quality-check, then reviews correctness, error handling, performance, project conventions, and reports findings by severity. Use when the user asks for a quick review, a sanity check of changed files, or "review this file".
license: MIT
---

Review the target code in this repository and report findings by severity.

**Steps**

1. **Identify target files**
   - Use the files the user names or the files currently open.
   - If none are named, review recent changes: `git status --short` and `git --no-pager diff` (plus `git --no-pager diff --staged`).

2. **Automated checks**
   - Run `bun run lint`, `bun run type-check`, and `bun run quality-check`.
   - Check for `TODO` / `FIXME` comments in the target files that should be addressed.

3. **Logic review**
   - **Correctness**: does the code do what it is meant to? Check off-by-one errors, null/undefined handling, and race conditions.
   - **Error handling**: async and network operations handle failures, and errors are surfaced or logged instead of swallowed.
   - **Performance**: redundant loops, expensive work inside loops, memory leaks, unbounded caches.

4. **Project conventions** (see `CLAUDE.md` / `AGENTS.md`)
   - Layering: pages/components → composables → stores → services; `services/` must not depend on Vue/Pinia.
   - Pages, layouts, and device-specific components use the dispatcher + Desktop/Tablet/Mobile pattern; no `v-if="isPhone"` branches in pages or layouts.
   - Type imports use `import type { ... }`; avoid `any`.
   - UI text goes through i18n resources in all three locales (`src/i18n/zh-CN|zh-TW|en-US`); agent-facing prompt text stays Simplified Chinese.
   - Runtime logic changes in `services/`, `composables/`, `stores/`, `models/` come with tests (TDD).

5. **Code quality**
   - **DRY**: duplicated logic that should become a helper.
   - **Readability**: naming, comment clarity, function length.

6. **Report**
   - 🔴 **Critical**: bugs or likely runtime errors.
   - 🟡 **Major**: logic flaws, convention violations, or significant performance issues.
   - 🔵 **Minor**: style, naming, or small refactoring suggestions.
   - Give `file:line` for each finding and a concrete fix (code snippet when useful).
