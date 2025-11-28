<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';

interface VolumeOption {
  label: string;
  value: string;
}

const props = defineProps<{
  visible: boolean;
  title: string;
  translation: string;
  targetVolumeId: string | null;
  volumeOptions: VolumeOption[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: { title: string; translation: string; targetVolumeId: string }): void;
}>();

const chapterTitle = ref('');
const chapterTranslation = ref('');
const selectedVolumeId = ref<string | null>(null);

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      chapterTitle.value = props.title;
      chapterTranslation.value = props.translation;
      selectedVolumeId.value = props.targetVolumeId;
    }
  },
);

watch(
  () => props.title,
  (newVal) => {
    if (props.visible) {
      chapterTitle.value = newVal;
    }
  },
);

watch(
  () => props.translation,
  (newVal) => {
    if (props.visible) {
      chapterTranslation.value = newVal;
    }
  },
);

watch(
  () => props.targetVolumeId,
  (newVal) => {
    if (props.visible) {
      selectedVolumeId.value = newVal;
    }
  },
);

const handleSave = () => {
  if (chapterTitle.value.trim() && selectedVolumeId.value) {
    emit('save', {
      title: chapterTitle.value.trim(),
      translation: chapterTranslation.value.trim(),
      targetVolumeId: selectedVolumeId.value,
    });
  }
};

const handleCancel = () => {
  emit('update:visible', false);
};

const handleTranslationApplied = (value: string) => {
  chapterTranslation.value = value;
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="编辑章节"
    :style="{ width: '30rem' }"
    :draggable="false"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="edit-chapter-title" class="block text-sm font-medium text-moon/90"
          >章节标题（原文）*</label
        >
        <TranslatableInput
          id="edit-chapter-title"
          v-model="chapterTitle"
          placeholder="输入章节标题..."
          type="input"
          :apply-translation-to-input="false"
          @translation-applied="handleTranslationApplied"
          @keyup.enter="handleSave"
        />
      </div>
      <div class="space-y-2">
        <label for="edit-chapter-translation" class="block text-sm font-medium text-moon/90"
          >翻译</label
        >
        <InputText
          id="edit-chapter-translation"
          v-model="chapterTranslation"
          placeholder="输入翻译（可选）"
          class="w-full"
          @keyup.enter="handleSave"
        />
      </div>
      <div class="space-y-2" v-if="volumeOptions.length > 0">
        <label for="edit-chapter-volume" class="block text-sm font-medium text-moon/90"
          >所属卷</label
        >
        <Select
          id="edit-chapter-volume"
          v-model="selectedVolumeId"
          :options="volumeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="选择卷"
          class="w-full"
        />
      </div>
    </div>
    <template #footer>
      <Button label="取消" class="p-button-text" :disabled="loading" @click="handleCancel" />
      <Button
        label="保存"
        :loading="loading"
        :disabled="!chapterTitle.trim() || !selectedVolumeId || loading"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

