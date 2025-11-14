<script setup lang="ts">
import { computed } from 'vue';
import AppMessage, { type MessageDetail } from './AppMessage.vue';

export interface TestResultLimits {
  rateLimit?: string;
  modelInfo?: string;
  maxTokens?: number;
}

export interface TestResult {
  success: boolean;
  message: string;
  limits?: TestResultLimits;
}

const props = defineProps<{
  result: TestResult | null;
}>();

defineEmits<{
  close: [];
}>();

const resultLimits = computed<MessageDetail[]>(() => {
  if (!props.result?.success || !props.result.limits) {
    return [];
  }

  const limits = props.result.limits;
  const details: MessageDetail[] = [];

  if (limits.modelInfo) {
    details.push({ label: '模型:', value: limits.modelInfo });
  }
  if (limits.rateLimit) {
    details.push({ label: '速率限制:', value: limits.rateLimit });
  }
  if (limits.maxTokens) {
    details.push({ label: '最大 Token:', value: limits.maxTokens.toLocaleString() });
  }

  return details;
});
</script>

<template>
  <AppMessage
    v-if="result"
    :severity="result.success ? 'success' : 'error'"
    :title="result.success ? '测试成功' : '测试失败'"
    :message="result.message"
    :closable="true"
    :detail="resultLimits"
    @close="$emit('close')"
  />
</template>
