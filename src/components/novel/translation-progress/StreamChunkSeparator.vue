<script setup lang="ts">
defineProps<{
  chunkInfo: string;
}>();
</script>

<template>
  <div class="stream-chunk-sep">{{ chunkInfo }}</div>
</template>

<style scoped>
.stream-chunk-sep {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
  color: rgba(108, 140, 255, 0.6);
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
}

.stream-chunk-sep::before,
.stream-chunk-sep::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(108, 140, 255, 0.15), transparent);
}
</style>
