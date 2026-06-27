<script setup lang="ts">
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';

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
        {{ hasActiveFilters ? '未找到匹配的记忆' : '暂无 记忆，AI 会在翻译过程中自动创建' }}
      </p>
      <Button
        v-if="hasActiveFilters"
        label="清除筛选"
        icon="pi pi-filter-slash"
        class="p-button-outlined mt-4"
        @click="$emit('clear')"
      />
      <Button
        v-else-if="!hasQuery && hasBook"
        label="手动添加 记忆"
        icon="pi pi-plus"
        class="p-button-outlined mt-4"
        @click="$emit('add')"
      />
    </template>
  </div>
</template>
