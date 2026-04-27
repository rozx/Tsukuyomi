<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  size?: number;
  glowing?: boolean;
  pulse?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 32,
  glowing: false,
  pulse: false,
});

const sizePx = computed(() => `${props.size}px`);
</script>

<template>
  <div
    class="assistant-avatar"
    :class="{
      'assistant-avatar--glowing': props.glowing,
      'assistant-avatar--pulse': props.pulse && props.glowing,
    }"
    role="img"
    aria-label="月詠"
  />
</template>

<style scoped>
.assistant-avatar {
  width: v-bind(sizePx);
  height: v-bind(sizePx);
  border-radius: 50%;
  flex-shrink: 0;
  background-image: url('/icons/android-chrome-192x192.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.assistant-avatar--glowing {
  box-shadow: 0 0 12px rgba(180, 140, 255, 0.4);
}

.assistant-avatar--pulse {
  animation: assistant-avatar-pulse 2s ease-in-out infinite;
}

@keyframes assistant-avatar-pulse {
  0%,
  100% {
    box-shadow: 0 0 8px rgba(180, 140, 255, 0.25);
  }
  50% {
    box-shadow: 0 0 18px rgba(180, 140, 255, 0.55);
  }
}
</style>
