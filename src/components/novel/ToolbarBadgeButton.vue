<script setup lang="ts">
import Button from 'primevue/button';
import Badge from 'primevue/badge';

// 工具栏带角标的图标按钮（术语/角色/记忆三处复用）。
// 把 v-if 角标与 >99 截断的值收敛到这里，避免 ChapterToolbar 模板重复三段近乎相同的结构。
defineProps<{
  icon: string;
  count: number;
  title: string;
}>();

defineEmits<{ click: [event: Event] }>();
</script>

<template>
  <div class="relative inline-flex">
    <Button
      :icon="icon"
      rounded
      text
      size="small"
      class="!w-8 !h-8 text-moon/70 hover:text-moon"
      :title="title"
      @click="$emit('click', $event)"
    />
    <Badge
      v-if="count > 0"
      :value="count > 99 ? '99+' : count"
      severity="info"
      class="absolute -top-1 -right-1 !min-w-[1.25rem] !h-[1.25rem] !text-[0.75rem] !p-0 flex items-center justify-center"
    />
  </div>
</template>
