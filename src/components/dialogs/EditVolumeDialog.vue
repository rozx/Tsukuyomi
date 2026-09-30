<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';

const { t } = useI18n();

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
  <AdaptiveDialog
    :visible="visible"
    :header="t('structureUi.editVolume')"
    desktop-width="30rem"
    :eyebrow="t('structureUi.volume')"
    sheet-min-height="auto"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="edit-volume-title" class="block text-sm font-medium text-moon/90">{{
          t('structureUi.originalVolumeTitle')
        }}</label>
        <TranslatableInput
          id="edit-volume-title"
          v-model="volumeTitle"
          :placeholder="t('structureUi.volumePlaceholder')"
          type="input"
          :apply-translation-to-input="false"
          @translation-applied="handleTranslationApplied"
          @keyup.enter="handleSave"
        />
      </div>
      <div class="space-y-2">
        <label for="edit-volume-translation" class="block text-sm font-medium text-moon/90">{{
          t('structureUi.translation')
        }}</label>
        <InputText
          id="edit-volume-translation"
          v-model="volumeTranslation"
          :placeholder="t('structureUi.translationPlaceholder')"
          class="w-full"
          @keyup.enter="handleSave"
        />
      </div>
    </div>
    <template #footer>
      <Button
        :label="t('structureUi.cancel')"
        class="p-button-text"
        :disabled="loading"
        @click="handleCancel"
      />
      <Button
        :label="t('structureUi.save')"
        :loading="loading"
        :disabled="!volumeTitle.trim() || loading"
        @click="handleSave"
      />
    </template>
  </AdaptiveDialog>
</template>
