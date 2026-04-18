<script setup lang="ts">
/**
 * Tablet book-details layout — reuses BookDetailsDesktop end-to-end (toolbars,
 * catalog drawer, settings menus, ChapterContentPanel, edit flows, AI task
 * dispatch). The only tablet-specific treatment is a CSS wrapper that rewrites
 * `.paragraph-content` from a stacked flex to a 2-column grid so 原文 and 译文
 * render side-by-side, matching the handoff mockup's dual-pane reader.
 *
 * Forking ParagraphCard / ChapterContentPanel to build a bespoke tablet
 * template would duplicate ~2,700 lines of highlighted-text / term popover /
 * character popover / editing / multi-version selection logic. The CSS-only
 * treatment gets the visual layout right without touching the heavy logic.
 */
import BookDetailsDesktop from './BookDetailsDesktop.vue';
</script>

<template>
  <div class="book-details-tablet">
    <BookDetailsDesktop />
  </div>
</template>

<style scoped>
.book-details-tablet {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.book-details-tablet > :deep(*) {
  flex: 1;
  min-height: 0;
}

.book-details-tablet :deep(.paragraph-content) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 20px;
  padding-right: 0;
}

.book-details-tablet :deep(.paragraph-text) {
  padding-right: 12px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.book-details-tablet :deep(.paragraph-translation-wrapper) {
  margin: 0;
  padding-top: 0;
  border-top: none;
  padding-left: 8px;
}

.book-details-tablet :deep(.chapter-content-panel)::before {
  content: '原文 · 日本語  |  译文 · 中文';
  display: block;
  position: sticky;
  top: 0;
  z-index: 4;
  background: rgba(10, 12, 15, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(155, 164, 179, 0.75);
  padding: 8px 22px;
}

.book-details-tablet :deep(.paragraph-card) {
  position: relative;
  padding-right: 3rem;
}

.book-details-tablet :deep(.recent-translation-icon-button),
.book-details-tablet :deep(.edit-translation-icon-button),
.book-details-tablet :deep(.context-menu-icon-button) {
  z-index: 3;
}
</style>
