<template>
  <div class="space-y-2">
    <div v-for="(header, index) in headers" :key="index" class="flex items-center gap-2">
      <InputText
        v-model="header.key"
        :placeholder="t('aiUi.headerPlaceholder')"
        class="flex-1"
        @input="emit('change')"
      />
      <InputText
        v-model="header.value"
        :placeholder="t('aiUi.headerValue')"
        class="flex-1"
        @input="emit('change')"
      />
      <Button
        icon="pi pi-trash"
        class="p-button-danger p-button-text p-button-sm p-2"
        @click="emit('remove', index)"
      />
    </div>
    <div
      v-if="headers.length === 0"
      class="text-xs text-moon/60 italic text-center py-2 bg-white/5 rounded"
    >
      {{ t('aiUi.noHeaders') }}
    </div>
    <div class="text-xs text-amber-500/80 mt-1">{{ t('aiUi.headerHint') }}</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import type { CustomHeaderItem } from './ai-model-form-types';
const { t } = useI18n();

defineProps<{
  headers: CustomHeaderItem[];
}>();

const emit = defineEmits<{
  change: [];
  remove: [index: number];
}>();
</script>
