<script setup lang="ts">
import Select from 'primevue/select';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import type { AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const aiModelsStore = useAIModelsStore();
const settingsStore = useSettingsStore();
const { t } = useI18n();

// 任务标签随界面语言变化（proofreading 任务同时用于校对和润色）
const taskLabels = computed<Record<keyof AIModelDefaultTasks, string>>(() => ({
  translation: t('aiUi.translation'),
  proofreading: t('aiUi.proofreadingCombined'),
  termsTranslation: t('aiUi.termsTranslation'),
  assistant: t('aiUi.assistant'),
}));

// 获取指定任务的可用模型选项（只显示该任务 isDefault 中 enabled 为 true 的模型）
const getModelOptionsForTask = (task: keyof AIModelDefaultTasks) => {
  const enabledModels = aiModelsStore.enabledModels;
  // 过滤出支持该任务的模型（isDefault[task].enabled === true）
  const availableModels = enabledModels.filter((model) => model.isDefault[task]?.enabled === true);
  return [
    { label: t('settingsUi.models.unset'), value: null },
    ...availableModels.map((model) => ({
      label: model.name,
      value: model.id,
    })),
  ];
};

// 获取任务的默认模型 ID
// 如果当前选中的模型不再支持该任务，自动清除该设置
const getTaskModelId = (task: keyof AIModelDefaultTasks): string | null | undefined => {
  const modelId = settingsStore.getTaskDefaultModelId(task);
  if (modelId) {
    // 检查该模型是否仍然支持该任务
    const model = aiModelsStore.getModelById(modelId);
    if (!model || !model.enabled || !model.isDefault[task]?.enabled) {
      // 模型不存在、已禁用或不再支持该任务，清除设置
      void settingsStore.setTaskDefaultModelId(task, null);
      return null;
    }
  }
  return modelId;
};

// 设置任务的默认模型 ID
const setTaskModelId = (task: keyof AIModelDefaultTasks, modelId: string | null) => {
  void settingsStore.setTaskDefaultModelId(task, modelId);
};
</script>

<template>
  <div class="p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">{{ t('settingsUi.models.title') }}</h3>
      <p class="text-xs text-moon/70">
        {{ t('settingsUi.models.description') }}
      </p>
    </div>
    <div class="space-y-3">
      <template v-for="(label, task) in taskLabels" :key="task">
        <div class="space-y-2">
          <label class="text-xs text-moon/80">{{ label }}</label>
          <Select
            :model-value="getTaskModelId(task)"
            :options="getModelOptionsForTask(task)"
            option-label="label"
            option-value="value"
            :placeholder="t('settingsUi.models.select')"
            class="w-full"
            @update:model-value="(value) => setTaskModelId(task, value)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
