<script setup lang="ts">
/**
 * Tablet variant: renders the Desktop template with the resize handle hidden.
 * Tablet currently has no resize affordance (right panel is an overlay managed
 * by MainLayout). Until a tablet-specific design lands, Desktop's template
 * with `showResizeHandle=false` is the correct hybrid.
 */
import AppRightPanelDesktop from './AppRightPanelDesktop.vue';
</script>

<template>
  <AppRightPanelDesktop :show-resize-handle="false" />
</template>
