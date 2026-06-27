<script setup lang="ts">
/**
 * 平板帮助页正文区的 loading / error 状态块。从 HelpPageTablet 抽出以降低其模板圈复杂度。
 * 把原先 v-if loading / v-else-if error 两条分支折叠为单个由 state 驱动的组件。
 */
defineProps<{
  state: 'loading' | 'error';
  error: string;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="state === 'loading'" class="ht-state">
    <i class="pi pi-spin pi-spinner" aria-hidden="true" />
    <p>加载文档中...</p>
  </div>

  <div v-else class="ht-state ht-state--error">
    <i class="pi pi-exclamation-triangle" aria-hidden="true" />
    <p>{{ error }}</p>
    <button class="ht-state-retry" @click="$emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.ht-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--moon-50-opacity-60);
}

.ht-state i {
  font-size: 28px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.ht-state--error {
  padding: 20px;
}

.ht-state--error i {
  color: var(--color-danger-400); /* token: danger-400 */
}

.ht-state-retry {
  padding: 8px 16px;
  background: var(--color-danger-400-opacity-15); /* token: danger-400 @ 15% */
  border: 1px solid var(--color-danger-400-opacity-30); /* token: danger-400 @ 30% */
  border-radius: 8px;
  color: var(--color-danger-300); /* token: danger-300 */
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
</style>
