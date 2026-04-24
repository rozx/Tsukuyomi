<script setup lang="ts">
/**
 * Desktop-only right panel wrapper (unified chat + progress tabs).
 *
 * Mobile and Tablet layouts render chat / progress as TWO independent
 * overlays mounted directly in their main layout shells (MobileChatSheet +
 * MobileProgressSheet / TabletChatPanel + TabletProgressPanel), so this
 * dispatcher is only consumed by MainLayoutDesktop. The fall-through to the
 * desktop template protects any stray call site on mobile/tablet.
 */
import AppRightPanelDesktop from './AppRightPanelDesktop.vue';

withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false });
</script>

<template>
  <AppRightPanelDesktop :collapsed="collapsed" />
</template>
