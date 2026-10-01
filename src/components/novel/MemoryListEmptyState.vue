<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
const { t } = useI18n();

// Memory 列表空状态：把加载/筛选/无数据的三分支展示收敛到叶子组件。
defineProps<{
  isLoading: boolean;
  hasActiveFilters: boolean;
  hasQuery: boolean;
  hasBook: boolean;
}>();

defineEmits<{ clear: []; add: [] }>();
</script>

<template>
  <div class="text-center py-12">
    <ProgressSpinner v-if="isLoading" />
    <template v-else>
      <i class="pi pi-database text-4xl text-moon/50 mb-4" />
      <p class="text-moon/70">
        {{ hasActiveFilters ? t('memoryUi.noMatches') : t('memoryUi.empty') }}
      </p>
      <Button
        v-if="hasActiveFilters"
        :label="t('memoryUi.clearFilters')"
        icon="pi pi-filter-slash"
        class="p-button-outlined mt-4"
        @click="$emit('clear')"
      />
      <Button
        v-else-if="!hasQuery && hasBook"
        :label="t('memoryUi.manualAdd')"
        icon="pi pi-plus"
        class="p-button-outlined mt-4"
        @click="$emit('add')"
      />
    </template>
  </div>
</template>
