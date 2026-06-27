<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <label :for="`${idPrefix}-model`" class="block text-sm font-medium text-moon/90"
        >模型标识 *</label
      >
      <Button
        v-if="canRefreshModels"
        label="刷新列表"
        icon="pi pi-refresh"
        class="p-button-text p-button-sm icon-button-hover"
        :loading="isLoadingModels"
        @click="emit('refresh')"
      />
    </div>
    <Select
      :id="`${idPrefix}-model`"
      v-model="formData.model"
      :options="modelOptions"
      optionLabel="label"
      optionValue="value"
      :editable="true"
      :loading="isLoadingModels"
      placeholder="例如: gpt-4, gemini-pro"
      class="w-full"
      :class="{ 'p-invalid': formErrors.model }"
      filter
    >
      <template #option="slotProps">
        <div class="flex flex-col">
          <span class="font-medium">{{ slotProps.option.label }}</span>
          <span
            v-if="slotProps.option.value !== slotProps.option.label"
            class="text-xs text-moon/60"
            >{{ slotProps.option.value }}</span
          >
        </div>
      </template>
    </Select>
    <small v-if="formErrors.model" class="p-error block mt-1">{{ formErrors.model }}</small>
    <small v-if="availableModels.length > 0" class="text-moon/60 text-xs block mt-1">
      找到 {{ availableModels.length }} 个可用模型
    </small>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import type { ModelInfo } from 'src/services/ai/types/ai-service';
import { AI_MODEL_FORM_KEY } from './ai-model-form-types';

defineProps<{
  modelOptions: { label: string; value: string; model: ModelInfo }[];
  availableModels: ModelInfo[];
  isLoadingModels: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

// 通过 provide/inject 取得共享表单状态（避免 prop 突变告警）
const { formData, formErrors, idPrefix } = inject(AI_MODEL_FORM_KEY)!;

// 刷新可用模型列表的前置条件：有 API Key，且非 Gemini 提供商必须有 baseUrl
const canRefreshModels = computed(() => {
  return (
    !!formData.value.apiKey?.trim() &&
    (formData.value.provider === 'gemini' || !!formData.value.baseUrl?.trim())
  );
});
</script>
