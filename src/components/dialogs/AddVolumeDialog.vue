<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, watch } from 'vue';
import DialogFormActions from './DialogFormActions.vue';
import InputText from 'primevue/inputtext';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';

const { t } = useI18n();

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
  <AdaptiveDialog
    :visible="visible"
    :header="t('structureUi.addVolume')"
    desktop-width="25rem"
    :eyebrow="t('structureUi.volume')"
    sheet-min-height="auto"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="volume-title" class="block text-sm font-medium text-moon/90">{{
          t('structureUi.volumeTitle')
        }}</label>
        <InputText
          id="volume-title"
          v-model="volumeTitle"
          :placeholder="t('structureUi.volumePlaceholder')"
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
        :disabled="!volumeTitle.trim()"
        @cancel="handleCancel"
        @submit="handleSave"
      />
    </template>
  </AdaptiveDialog>
</template>
