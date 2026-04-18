<script setup lang="ts">
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';

defineProps<{
  visible: boolean;
  chapterTitle: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
}>();

const handleConfirm = () => {
  emit('confirm');
};

const handleCancel = () => {
  emit('update:visible', false);
};
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    header="确认删除"
    desktop-width="25rem"
    eyebrow="DELETE"
    sheet-min-height="auto"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <p class="text-moon/90">
        确定要删除章节 <strong>"{{ chapterTitle }}"</strong> 吗？
      </p>
      <p class="text-sm text-moon/70">此操作无法撤销。</p>
    </div>
    <template #footer>
      <Button label="取消" class="p-button-text" :disabled="loading" @click="handleCancel" />
      <Button
        label="删除"
        class="p-button-danger"
        :loading="loading"
        :disabled="loading"
        @click="handleConfirm"
      />
    </template>
  </AdaptiveDialog>
</template>
