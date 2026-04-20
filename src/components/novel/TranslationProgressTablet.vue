<script setup lang="ts">
/**
 * Tablet variant — reuses the Desktop composition (TaskSwitcher / TaskStatusBar /
 * TaskTodos / TaskStream / TaskActionBar / TaskEmptyState). The mockup's
 * right-dock translation progress panel is structurally identical to this
 * composition rendered inside the `AppRightPanel` overlay; the panel's width
 * (controlled by `ui.rightPanelWidth`) already maps to the mockup's 420px dock.
 *
 * Forking the sub-components into tablet-specific siblings to add hero-meter /
 * tabs / etc. would invent features not present in the existing store — see
 * `openspec/changes/implement-tablet-view/design.md` Decision 3.
 */
import TranslationProgressDesktop from './TranslationProgressDesktop.vue';
</script>

<template>
  <div class="translation-progress-tablet">
    <TranslationProgressDesktop />
  </div>
</template>

<style scoped>
.translation-progress-tablet {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Tablet dock can be tighter than desktop — adjust internal padding rhythm. */
.translation-progress-tablet :deep(.task-status-bar) {
  padding-inline: 16px;
}
</style>
