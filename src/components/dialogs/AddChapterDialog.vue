<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, watch } from 'vue';
import DialogFormActions from './DialogFormActions.vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';

const { t } = useI18n();

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
    :header="t('structureUi.addChapter')"
    desktop-width="25rem"
    :eyebrow="t('structureUi.chapter')"
    sheet-min-height="auto"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="volume-select" class="block text-sm font-medium text-moon/90">{{
          t('structureUi.selectVolume')
        }}</label>
        <Select
          id="volume-select"
          v-model="selectedVolumeId"
          :options="volumeOptions"
          optionLabel="label"
          optionValue="value"
          :placeholder="t('structureUi.selectVolumePlaceholder')"
          class="w-full"
        />
      </div>
      <div class="space-y-2">
        <label for="chapter-title" class="block text-sm font-medium text-moon/90">{{
          t('structureUi.chapterTitle')
        }}</label>
        <InputText
          id="chapter-title"
          v-model="chapterTitle"
          :placeholder="t('structureUi.chapterPlaceholder')"
          class="w-full"
          autofocus
          @keyup.enter="handleSave"
        />
      </div>
    </div>
    <template #footer>
      <DialogFormActions
        :submit-label="t('structureUi.add')"
        :loading="loading"
        :disabled="!chapterTitle.trim() || !selectedVolumeId"
        @cancel="handleCancel"
        @submit="handleSave"
      />
    </template>
  </AdaptiveDialog>
</template>
