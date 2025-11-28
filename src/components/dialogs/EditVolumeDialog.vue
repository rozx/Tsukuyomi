<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';

const props = defineProps<{
  visible: boolean;
  title: string;
  translation: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: { title: string; translation: string }): void;
}>();

const volumeTitle = ref('');
const volumeTranslation = ref('');

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      volumeTitle.value = props.title;
      volumeTranslation.value = props.translation;
    }
  },
);

watch(
  () => props.title,
  (newVal) => {
    if (props.visible) {
      volumeTitle.value = newVal;
    }
  },
);

watch(
  () => props.translation,
  (newVal) => {
    if (props.visible) {
      volumeTranslation.value = newVal;
    }
  },
);

const handleSave = () => {
  if (volumeTitle.value.trim()) {
    emit('save', {
      title: volumeTitle.value.trim(),
      translation: volumeTranslation.value.trim(),
    });
  }
};

const handleCancel = () => {
  emit('update:visible', false);
};

const handleTranslationApplied = (value: string) => {
  volumeTranslation.value = value;
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="编辑卷标题"
    :style="{ width: '30rem' }"
    :draggable="false"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="edit-volume-title" class="block text-sm font-medium text-moon/90"
          >卷标题（原文）*</label
        >
        <TranslatableInput
          id="edit-volume-title"
          v-model="volumeTitle"
          placeholder="输入卷标题..."
          type="input"
          :apply-translation-to-input="false"
          @translation-applied="handleTranslationApplied"
          @keyup.enter="handleSave"
        />
      </div>
      <div class="space-y-2">
        <label for="edit-volume-translation" class="block text-sm font-medium text-moon/90"
          >翻译</label
        >
        <InputText
          id="edit-volume-translation"
          v-model="volumeTranslation"
          placeholder="输入翻译（可选）"
          class="w-full"
          @keyup.enter="handleSave"
        />
      </div>
    </div>
    <template #footer>
      <Button label="取消" class="p-button-text" :disabled="loading" @click="handleCancel" />
      <Button
        label="保存"
        :loading="loading"
        :disabled="!volumeTitle.trim() || loading"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>

