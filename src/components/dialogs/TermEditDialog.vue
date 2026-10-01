<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import AppMessage from 'src/components/common/AppMessage.vue';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import type { EntityDialogProps, EntityDialogEmits, EntityNameForm } from './entity-dialog-types';
import { getNameTranslation } from 'src/services/localization/selection';
import { useLanguageEditGuard } from 'src/composables/translation/useLanguageEditGuard';
import type { Terminology } from 'src/models/novel';

const { t } = useI18n();

const props = defineProps<
  EntityDialogProps & { term?: Terminology | null; mode: 'add' | 'edit' }
>();
const emit = defineEmits<EntityDialogEmits<EntityNameForm>>();

const { languageChanged, languageChangedMessage, captureLanguage } = useLanguageEditGuard(
  () => props.targetLanguage ?? 'zh-CN',
);

const formData = ref({
  name: '',
  description: '',
  translation: '',
});

// Reset form when dialog opens or term changes
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      captureLanguage();
      if (props.mode === 'edit' && props.term) {
        formData.value = {
          name: props.term.name,
          description: props.term.description || '',
          translation:
            getNameTranslation(props.term, props.targetLanguage ?? 'zh-CN')?.translation ?? '',
        };
      } else {
        formData.value = {
          name: '',
          description: '',
          translation: '',
        };
      }
    }
  },
);

// Also watch term prop in case it changes while dialog is open (less likely but good practice)
watch(
  () => props.term,
  (newTerm) => {
    if (props.visible && props.mode === 'edit' && newTerm && !languageChanged.value) {
      formData.value = {
        name: newTerm.name,
        description: newTerm.description || '',
        translation:
          getNameTranslation(newTerm, props.targetLanguage ?? 'zh-CN')?.translation ?? '',
      };
    }
  },
);

const handleNameUpdate = (value: string) => {
  formData.value.name = value;
};

const handleTranslationApplied = (result: string) => {
  formData.value.translation = result;
};

const handleSave = () => {
  if (languageChanged.value) return;
  // 验证必填字段
  const trimmedName = formData.value.name.trim();
  if (!trimmedName) {
    // 名称不能为空，但这里不显示错误，由父组件处理
    return;
  }

  emit('save', {
    name: trimmedName,
    translation: formData.value.translation.trim(),
    description: formData.value.description.trim(),
  });
};

const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    :header="mode === 'add' ? t('entityUi.addTerm') : t('entityUi.editTerm')"
    desktop-width="30rem"
    :eyebrow="t('entityUi.term')"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="space-y-4">
      <AppMessage
        v-if="languageChanged"
        severity="warn"
        :message="languageChangedMessage"
        :closable="false"
      />
      <div class="space-y-2">
        <label class="text-sm text-moon/80">{{ t('entityUi.termName') }}</label>
        <TranslatableInput
          v-model="formData.name"
          :placeholder="t('entityUi.termPlaceholder')"
          :apply-translation-to-input="false"
          @update:model-value="handleNameUpdate"
          @translation-applied="handleTranslationApplied"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon/80">{{ t('entityUi.translation') }}</label>
        <InputText
          v-model="formData.translation"
          :placeholder="t('entityUi.translationPlaceholder')"
          class="w-full"
        />
        <AppMessage severity="info" :message="t('entityUi.termAiHint')" :closable="false" />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon/80">{{ t('entityUi.description') }}</label>
        <Textarea
          v-model="formData.description"
          :placeholder="t('entityUi.descriptionPlaceholder')"
          :rows="3"
          class="w-full"
        />
        <AppMessage
          severity="info"
          :message="t('entityUi.termDescriptionHint')"
          :closable="false"
        />
      </div>
    </div>

    <template #footer>
      <Button
        :label="t('entityUi.cancel')"
        icon="pi pi-times"
        class="p-button-text"
        :disabled="loading"
        @click="handleClose"
      />
      <Button
        :label="t('entityUi.save')"
        icon="pi pi-check"
        class="p-button-primary"
        :loading="loading"
        :disabled="loading || !formData.name.trim()"
        @click="handleSave"
      />
    </template>
  </AdaptiveDialog>
</template>
