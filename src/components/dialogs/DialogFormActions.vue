<template>
  <Button
    :label="t('structureUi.cancel')"
    class="p-button-text"
    :disabled="loading"
    @click="emit('cancel')"
  />
  <Button
    :label="submitLabel"
    :class="{ 'p-button-danger': danger }"
    :loading="loading"
    :disabled="disabled || loading"
    @click="emit('submit')"
  />
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
const { t } = useI18n();
defineProps<{
  submitLabel: string;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  danger?: boolean;
}>();
const emit = defineEmits<{ cancel: []; submit: [] }>();
</script>
