<template>
  <div class="space-y-2">
    <div v-for="(header, index) in headers" :key="index" class="flex items-center gap-2">
      <InputText
        v-model="header.key"
        placeholder="Header Key (例如: User-Agent)"
        class="flex-1"
        @input="emit('change')"
      />
      <InputText
        v-model="header.value"
        placeholder="Value"
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
      未配置自定义请求头
    </div>
    <div class="text-xs text-amber-500/80 mt-1">
      * 注意：某些 Header 可能会被浏览器安全策略阻止，或覆盖默认的 API Key 认证机制。
    </div>
  </div>
</template>

<script setup lang="ts">
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import type { CustomHeaderItem } from './ai-model-form-types';

defineProps<{
  headers: CustomHeaderItem[];
}>();

const emit = defineEmits<{
  change: [];
  remove: [index: number];
}>();
</script>
