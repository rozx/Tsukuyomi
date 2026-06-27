<template>
  <div class="space-y-5">
    <!-- 启用状态 -->
    <div
      class="flex items-center justify-between py-3 px-3 bg-white/5 rounded-lg border border-white/10"
    >
      <label :for="`${idPrefix}-enabled`" class="block text-sm font-medium text-moon/90"
        >启用模型</label
      >
      <ToggleSwitch :id="`${idPrefix}-enabled`" v-model="formData.enabled" />
    </div>

    <!-- CORS 代理（仅浏览器模式显示） -->
    <div
      v-if="isBrowser"
      class="flex items-center justify-between py-3 px-3 bg-white/5 rounded-lg border border-white/10"
    >
      <div>
        <label :for="`${idPrefix}-useCorsProxy`" class="block text-sm font-medium text-moon/90"
          >使用 CORS 代理</label
        >
        <small class="text-xs text-moon/60">关闭后 API 请求将直连，不经过 CORS 代理服务器</small>
      </div>
      <ToggleSwitch :id="`${idPrefix}-useCorsProxy`" v-model="formData.useCorsProxy" />
    </div>

    <!-- 模型名称 -->
    <div class="space-y-2">
      <label :for="`${idPrefix}-name`" class="block text-sm font-medium text-moon/90"
        >模型名称 *</label
      >
      <InputText
        :id="`${idPrefix}-name`"
        v-model="formData.name"
        placeholder="例如: GPT-4 翻译模型"
        class="w-full"
        :class="{ 'p-invalid': formErrors.name }"
      />
      <small v-if="formErrors.name" class="p-error block mt-1">{{ formErrors.name }}</small>
    </div>

    <!-- 温度 -->
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label :for="`${idPrefix}-temperature`" class="block text-sm font-medium text-moon/90"
          >温度 (0-2) *</label
        >
        <span class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded">{{
          formData.temperature
        }}</span>
      </div>
      <Slider
        :id="`${idPrefix}-temperature`"
        v-model="formData.temperature"
        :min="0"
        :max="2"
        :step="0.1"
        class="w-full mt-2"
      />
      <small v-if="formErrors.temperature" class="p-error block mt-1">{{
        formErrors.temperature
      }}</small>
    </div>

    <!-- 提供商 -->
    <div class="space-y-2">
      <label :for="`${idPrefix}-provider`" class="block text-sm font-medium text-moon/90"
        >提供商 *</label
      >
      <Select
        :id="`${idPrefix}-provider`"
        v-model="formData.provider"
        :options="providerOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="选择提供商"
        class="w-full"
      />
    </div>

    <!-- API Key -->
    <div class="space-y-2">
      <label :for="`${idPrefix}-apiKey`" class="block text-sm font-medium text-moon/90"
        >API Key *</label
      >
      <InputText
        :id="`${idPrefix}-apiKey`"
        v-model="formData.apiKey"
        type="password"
        placeholder="输入 API Key"
        class="w-full"
        :class="{ 'p-invalid': formErrors.apiKey }"
      />
      <small v-if="formErrors.apiKey" class="p-error block mt-1">{{ formErrors.apiKey }}</small>
    </div>

    <!-- 基础地址（Gemini 不需要） -->
    <div v-if="formData.provider !== 'gemini'" class="space-y-2">
      <label :for="`${idPrefix}-baseUrl`" class="block text-sm font-medium text-moon/90"
        >基础地址 *</label
      >
      <InputText
        :id="`${idPrefix}-baseUrl`"
        v-model="formData.baseUrl"
        placeholder="例如: https://api.openai.com/v1"
        class="w-full"
        :class="{ 'p-invalid': formErrors.baseUrl }"
      />
      <small v-if="formErrors.baseUrl" class="p-error block mt-1">{{ formErrors.baseUrl }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import Slider from 'primevue/slider';
import type { AIProvider } from 'src/services/ai/types/ai-model';
import { AI_MODEL_FORM_KEY } from './ai-model-form-types';

defineProps<{
  isBrowser: boolean;
}>();

// 通过 provide/inject 取得共享表单状态（避免 prop 突变告警）
const { formData, formErrors, idPrefix } = inject(AI_MODEL_FORM_KEY)!;

// 提供商选项
const providerOptions = [
  { label: 'OpenAI', value: 'openai' as AIProvider },
  { label: 'Gemini', value: 'gemini' as AIProvider },
];
</script>
