<script setup lang="ts">
/**
 * Tablet variant — today's tablet shell for BookDetailsPage is the same as desktop
 * (sidebar + main content + workspace switcher). When a dedicated tablet layout is
 * designed, replace this template. The Desktop variant is already responsive-aware
 * (it reacts to `isSmallScreen && !isPhone` to show the workspace switcher + settings
 * subnav).
 */
import BookDetailsDesktop from './BookDetailsDesktop.vue';
</script>

<template>
  <BookDetailsDesktop />
</template>
