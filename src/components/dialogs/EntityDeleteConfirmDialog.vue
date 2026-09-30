<template>
  <AdaptiveDialog
    :visible="props.visible"
    :header="t(props.headerKey)"
    desktop-width="25rem"
    :eyebrow="t('structureUi.delete')"
    sheet-min-height="auto"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="space-y-4">
      <i18n-t :keypath="props.questionKey" tag="p" class="text-moon/90">
        <template #name
          ><strong>{{ props.name }}</strong></template
        >
      </i18n-t>
      <p class="text-sm text-moon/70">{{ t(props.warningKey) }}</p>
    </div>
    <template #footer>
      <DialogFormActions
        :submit-label="t('structureUi.delete')"
        :loading="props.loading"
        danger
        @cancel="emit('update:visible', false)"
        @submit="emit('confirm')"
      />
    </template>
  </AdaptiveDialog>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import DialogFormActions from './DialogFormActions.vue';
import type { MessageKey } from 'src/i18n/types';
const { t } = useI18n();
const props = defineProps<{
  visible: boolean;
  name: string | null;
  headerKey: MessageKey;
  questionKey: MessageKey;
  warningKey: MessageKey;
  loading?: boolean | undefined;
}>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [];
}>();
</script>
