<script setup lang="ts">
/**
 * Desktop 变体：直接复用 Tablet 的 modal 卡片布局。
 * 桌面宽度更充裕，只是把卡片 max-width 放宽，其余样式完全共享,
 * 避免在两个变体里复制同一套卡片/tab nav CSS。
 */
import SettingsPageTablet from './SettingsPageTablet.vue';
</script>

<template>
  <SettingsPageTablet class="settings-page-desktop" />
</template>

<style scoped>
.settings-page-desktop :deep(.settings-tablet-card) {
  max-width: 1200px;
}
</style>
