<script setup lang="ts">
/**
 * 设置标签页根容器：纵向排列若干 SettingsSection，统一间距与最大宽度。
 * 外边距由设置页各变体（Desktop / Tablet / Mobile）的内容区负责，这里不再加 padding，避免双重留白。
 */
</script>

<template>
  <div class="settings-panel">
    <slot />
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 56rem;
  min-width: 0;
}
</style>
