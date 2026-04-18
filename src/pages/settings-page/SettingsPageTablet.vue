<script setup lang="ts">
/**
 * Tablet variant — reuses the Desktop tabbed layout. Tablet already works
 * well with the horizontal PrimeVue tab list at 94vw; a dedicated tablet
 * redesign can replace this wrapper later without touching the dispatcher.
 */
import SettingsPageDesktop from './SettingsPageDesktop.vue';
</script>

<template>
  <SettingsPageDesktop />
</template>
