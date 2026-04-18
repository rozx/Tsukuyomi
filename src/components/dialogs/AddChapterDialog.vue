<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';

interface VolumeOption {
  label: string;
  value: string;
}

const props = defineProps<{
  visible: boolean;
  volumeOptions: VolumeOption[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: { title: string; volumeId: string }): void;
}>();

const chapterTitle = ref('');
const selectedVolumeId = ref<string | null>(null);

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      chapterTitle.value = '';
      selectedVolumeId.value = null;
    }
  },
);

const handleSave = () => {
  if (chapterTitle.value.trim() && selectedVolumeId.value) {
    emit('save', {
      title: chapterTitle.value.trim(),
      volumeId: selectedVolumeId.value,
    });
  }
};

const handleCancel = () => {
  emit('update:visible', false);
};
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    header="添加新章节"
    desktop-width="25rem"
    eyebrow="CHAPTER"
    sheet-min-height="auto"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="volume-select" class="block text-sm font-medium text-moon/90">选择卷</label>
        <Select
          id="volume-select"
          v-model="selectedVolumeId"
          :options="volumeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="请选择卷"
          class="w-full"
        />
      </div>
      <div class="space-y-2">
        <label for="chapter-title" class="block text-sm font-medium text-moon/90">章节标题</label>
        <InputText
          id="chapter-title"
          v-model="chapterTitle"
          placeholder="输入章节标题..."
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
        :disabled="!chapterTitle.trim() || !selectedVolumeId || loading"
        @click="handleSave"
      />
    </template>
  </AdaptiveDialog>
</template>

