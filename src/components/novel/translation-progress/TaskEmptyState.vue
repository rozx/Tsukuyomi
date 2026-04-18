<script setup lang="ts">
/**
 * Shared empty state for the translation progress panel.
 * Used by both the Desktop and Mobile variants — extract so markup + styles
 * live in one place instead of being duplicated across variant files.
 */
</script>

<template>
  <div class="empty-state">
    <i class="pi pi-info-circle" />
    <span>暂无翻译任务</span>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  color: var(--moon-opacity-40);
  font-size: 0.875rem;
  flex: 1;
}
</style>
