<script setup lang="ts">
/**
 * 设置页说明框：带图标的淡底提示，用于存储说明、权重说明等补充信息。
 */
</script>

<template>
  <div class="settings-note">
    <i class="pi pi-info-circle settings-note-icon" aria-hidden="true" />
    <div class="settings-note-body"><slot /></div>
  </div>
</template>

<style scoped>
.settings-note {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  background: var(--white-opacity-3);
  font-size: 0.76rem;
  line-height: 1.6;
  color: var(--moon-50-opacity-70);
}

.settings-note-icon {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--tsukuyomi-200-opacity-75);
  flex-shrink: 0;
}

.settings-note-body {
  min-width: 0;
}

.settings-note-body :deep(strong) {
  color: var(--moon-50-opacity-90);
  font-weight: 600;
}
</style>
