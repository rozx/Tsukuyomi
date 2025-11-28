<script setup lang="ts">
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

const props = defineProps<{
  visible: boolean;
  characterName: string | null;
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
  <Dialog
    :visible="visible"
    modal
    header="确认删除角色"
    :style="{ width: '25rem' }"
    :draggable="false"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <p class="text-moon/90">
        确定要删除角色 <strong>"{{ characterName }}"</strong> 吗？
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
  </Dialog>
</template>

