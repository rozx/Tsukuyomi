<script setup lang="ts">
import Select from 'primevue/select';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsField from './form/SettingsField.vue';
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
// 读取不修改设置：同步时模型可能尚未到达，暂时显示未设置并保留已保存的选择。
const getTaskModelId = (task: keyof AIModelDefaultTasks): string | null | undefined => {
  const modelId = settingsStore.getTaskDefaultModelId(task);
  if (modelId) {
    // 检查该模型是否仍然支持该任务
    const model = aiModelsStore.getModelById(modelId);
    if (!model || !model.enabled || !model.isDefault[task]?.enabled) {
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
  <SettingsPanel>
    <SettingsSection
      :title="t('settingsUi.models.title')"
      :description="t('settingsUi.models.description')"
    >
      <SettingsField
        v-for="(label, task) in taskLabels"
        :key="task"
        :label="label"
        :input-id="`default-model-${task}`"
      >
        <Select
          :input-id="`default-model-${task}`"
          :model-value="getTaskModelId(task)"
          :options="getModelOptionsForTask(task)"
          option-label="label"
          option-value="value"
          :placeholder="t('settingsUi.models.select')"
          class="w-full"
          @update:model-value="(value) => setTaskModelId(task, value)"
        />
      </SettingsField>
    </SettingsSection>
  </SettingsPanel>
</template>
