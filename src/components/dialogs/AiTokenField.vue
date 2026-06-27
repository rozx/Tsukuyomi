<template>
  <div class="space-y-1">
    <label class="text-xs text-moon/70">{{ label }}</label>
    <InputNumber
      :id="inputId"
      v-model="model"
      :min="0"
      :max="max"
      :use-grouping="true"
      :show-buttons="false"
      placeholder="0 表示无限制"
      class="w-full"
      :class="{ 'p-invalid': !!error }"
    />
    <small v-if="error" class="p-error block mt-1">{{ error }}</small>
    <small v-else-if="showAiHint" class="text-xs text-moon/70 block mt-1">
      {{ aiHintLabel }}: {{ aiConfigValue?.toLocaleString() }}
    </small>
    <small v-else-if="isZero" class="text-xs text-moon/70 block mt-1"> 0 表示无限制 </small>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import InputNumber from 'primevue/inputnumber';

const props = defineProps<{
  label: string;
  inputId: string;
  max: number;
  error?: string | undefined;
  aiConfigValue?: number | undefined;
  aiHintLabel: string;
}>();

const model = defineModel<number | undefined>({ required: true });

// 展示从 AI 获取到的值（且与当前值不同时）
const showAiHint = computed(
  () => !!props.aiConfigValue && props.aiConfigValue > 0 && model.value !== props.aiConfigValue,
);

// 当前值为 0（表示无限制）
const isZero = computed(() => (model.value ?? 0) === 0);
</script>
