<script setup lang="ts">
/**
 * Tablet variant — delegates to `HelpPageDesktop`, which already composes
 * a responsive two-column documentation layout (256px nav sidebar + fluid
 * article pane with an optional 240px TOC) that renders correctly at tablet
 * viewport widths. The mockup's tablet two-column doc layout is effectively
 * the desktop layout scaled down; no tablet-only sub-components needed.
 */
import HelpPageDesktop from './HelpPageDesktop.vue';
</script>

<template>
  <HelpPageDesktop />
</template>
