<template>
  <div class="p-3">
    <div class="flex justify-between items-start gap-2">
      <div>
        <h4 class="font-medium text-moon-100">{{ title }}</h4>
        <p class="text-xs text-moon/60 mt-1">{{ t('panelUi.itemCount', { count }) }}</p>
      </div>
      <Button
        icon="pi pi-plus"
        :label="t('panelUi.create')"
        size="small"
        class="!text-xs !px-2 !py-1 !h-auto"
        @click="emit('create')"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
const { t } = useI18n();
defineProps<{ title: string; count: number }>();
const emit = defineEmits<{ create: [] }>();
</script>
