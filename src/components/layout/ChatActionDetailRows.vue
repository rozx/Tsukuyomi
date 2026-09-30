<script setup lang="ts">
/**
 * 操作详情的「标签 / 取值」列表。桌面 Popover 与手机 MobileBottomSheet 共用，
 * 标签已由父组件按界面语言渲染，取值（名称、说明等历史文本）原样展示。
 */
defineProps<{
  details: Array<{ label: string; value: string }>;
}>();
</script>

<template>
  <div class="popover-details">
    <div v-for="(detail, detailIdx) in details" :key="detailIdx" class="popover-detail-item">
      <span class="popover-detail-label">{{ detail.label }}</span>
      <span class="popover-detail-value">{{ detail.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.popover-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 60dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.popover-detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
}

.popover-detail-label {
  color: var(--moon-opacity-70);
  font-weight: 500;
}

.popover-detail-value {
  color: var(--moon-opacity-90);
  word-break: break-word;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
