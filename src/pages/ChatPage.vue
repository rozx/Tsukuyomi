<script setup lang="ts">
/** Dispatcher for the AI assistant (Chat) page. */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import ChatPageDesktop from './chat-page/ChatPageDesktop.vue';
import ChatPageTablet from './chat-page/ChatPageTablet.vue';
import ChatPageMobile from './chat-page/ChatPageMobile.vue';

const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return ChatPageMobile;
    case 'tablet':
      return ChatPageTablet;
    case 'desktop':
    default:
      return ChatPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
