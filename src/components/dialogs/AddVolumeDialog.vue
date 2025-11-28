<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

const props = defineProps<{
  visible: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', title: string): void;
}>();

const volumeTitle = ref('');

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      volumeTitle.value = '';
    }
  },
);

const handleSave = () => {
  if (volumeTitle.value.trim()) {
    emit('save', volumeTitle.value.trim());
  }
};

const handleCancel = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="添加新卷"
    :style="{ width: '25rem' }"
    :draggable="false"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="volume-title" class="block text-sm font-medium text-moon/90">卷标题</label>
        <InputText
          id="volume-title"
          v-model="volumeTitle"
          placeholder="输入卷标题..."
          class="w-full"
          autofocus
          @keyup.enter="handleSave"
        />
      </div>
    </div>
    <template #footer>
      <Button label="取消" class="p-button-text" :disabled="loading" @click="handleCancel" />
      <Button
        label="添加"
        :loading="loading"
        :disabled="!volumeTitle.trim() || loading"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

