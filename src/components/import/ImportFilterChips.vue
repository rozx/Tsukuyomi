<script setup lang="ts" generic="T extends string">
/** 带数量的筛选按钮组（来源状态、章节变化类型等）。 */
defineProps<{
  filters: { id: T; label: string; count: number }[];
  label: string;
}>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="ipl-filters" role="group" :aria-label="label">
    <button
      v-for="entry in filters"
      :key="entry.id"
      type="button"
      class="ipl-filter"
      :class="{ 'ipl-filter--active': model === entry.id }"
      :aria-pressed="model === entry.id"
      @click="model = entry.id"
    >
      {{ entry.label }} {{ entry.count }}
    </button>
  </div>
</template>

<style scoped src="./import-card.css"></style>
