<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppLocale } from 'src/models/locale';
import { chunkSeparatorLabel } from 'src/composables/useThinkingFormatter';

const props = defineProps<{
  chunkInfo: string;
}>();
const { locale } = useI18n();
// 思考流中存的是简中分块标记，显示时按当前界面语言渲染
const label = computed(() => chunkSeparatorLabel(props.chunkInfo, locale.value as AppLocale));
</script>

<template>
  <div class="stream-chunk-sep">{{ label }}</div>
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
  font-family: var(--font-mono);
}

.stream-chunk-sep::before,
.stream-chunk-sep::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(108, 140, 255, 0.15), transparent);
}
</style>
