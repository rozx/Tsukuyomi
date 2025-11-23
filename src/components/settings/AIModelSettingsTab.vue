<script setup lang="ts">
import Select from 'primevue/select';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import type { AIModelDefaultTasks } from 'src/services/ai/types/ai-model';
import { TASK_TYPE_LABELS } from 'src/constants/ai';

const aiModelsStore = useAIModelsStore();
const settingsStore = useSettingsStore();

// 任务配置（使用集中化的标签常量）
const taskLabels: Record<keyof AIModelDefaultTasks, string> = {
  translation: TASK_TYPE_LABELS.translation,
  proofreading: TASK_TYPE_LABELS.proofreading,
  termsTranslation: TASK_TYPE_LABELS.termsTranslation,
  assistant: TASK_TYPE_LABELS.assistant,
};

// 获取指定任务的可用模型选项（只显示该任务 isDefault 中 enabled 为 true 的模型）
const getModelOptionsForTask = (task: keyof AIModelDefaultTasks) => {
  const enabledModels = aiModelsStore.enabledModels;
  // 过滤出支持该任务的模型（isDefault[task].enabled === true）
  const availableModels = enabledModels.filter((model) => model.isDefault[task]?.enabled === true);
  return [
    { label: '未设置', value: null },
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
      <h3 class="text-sm font-medium text-moon/90 mb-1">AI 模型默认设置</h3>
      <p class="text-xs text-moon/70">
        为不同任务选择默认使用的 AI 模型，这些设置会随导入/导出一起保存
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
            placeholder="选择模型"
            class="w-full"
            @update:model-value="(value) => setTaskModelId(task, value)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

