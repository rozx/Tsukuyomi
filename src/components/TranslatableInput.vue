<script setup lang="ts">
import { computed, ref } from 'vue';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import SplitButton from 'primevue/splitbutton';
import type { MenuItem } from 'primevue/menuitem';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TranslationService } from 'src/services/ai';

interface Props {
  modelValue: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

// 计算 id，如果未提供则返回 undefined
const inputId = computed<string | undefined>(() => props.id);

const aiModelsStore = useAIModelsStore();
const toast = useToastWithHistory();

// 翻译状态
const translating = ref(false);

// 获取所有可用的翻译模型
const availableTranslationModels = computed(() => {
  return aiModelsStore.models.filter(
    (model) => model.enabled && model.isDefault.translation?.enabled,
  );
});

// 翻译模型菜单项
const translationModelMenuItems = computed<MenuItem[]>(() => {
  return availableTranslationModels.value.map((model) => ({
    label: model.name || model.model,
    icon: model.provider === 'openai' ? 'pi pi-openai' : 'pi pi-google',
    command: () => {
      void handleTranslate(model.id);
    },
  }));
});

// 翻译文本
const handleTranslate = async (modelId?: string) => {
  if (!props.modelValue?.trim()) {
    return;
  }

  const originalText = props.modelValue.trim();
  translating.value = true;

  try {
    // 获取指定的模型或默认的翻译模型
    const selectedModel = modelId
      ? aiModelsStore.getModelById(modelId)
      : aiModelsStore.getDefaultModelForTask('translation');

    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: '未找到可用的翻译模型，请在设置中配置',
        life: 3000,
      });
      return;
    }

    // 使用翻译服务进行翻译
    const translatedText = await TranslationService.translate(originalText, selectedModel);

    emit('update:modelValue', translatedText);
    toast.add({
      severity: 'success',
      summary: '翻译成功',
      detail: `已翻译为: ${translatedText}`,
      life: 3000,
    });
  } catch (error) {
    console.error('翻译失败:', error);
    toast.add({
      severity: 'error',
      summary: '翻译失败',
      detail: error instanceof Error ? error.message : '翻译时发生未知错误',
      life: 3000,
    });
  } finally {
    translating.value = false;
  }
};
</script>

<template>
  <InputGroup>
    <InputText
      v-if="inputId"
      :id="inputId as string"
      :model-value="modelValue"
      :placeholder="placeholder"
      class="flex-1"
      :class="{ 'p-invalid': invalid }"
      :disabled="disabled || translating"
      @update:model-value="(value: string | undefined) => emit('update:modelValue', value ?? '')"
    />
    <InputText
      v-else
      :model-value="modelValue"
      :placeholder="placeholder"
      class="flex-1"
      :class="{ 'p-invalid': invalid }"
      :disabled="disabled || translating"
      @update:model-value="(value: string | undefined) => emit('update:modelValue', value ?? '')"
    />
    <InputGroupAddon>
      <SplitButton
        icon="pi pi-language"
        class="translatable-input-button"
        :loading="translating"
        :disabled="!modelValue?.trim() || translating || availableTranslationModels.length === 0"
        :model="translationModelMenuItems"
        @click="handleTranslate()"
      />
    </InputGroupAddon>
  </InputGroup>
</template>

<style scoped>
/* 确保按钮占满整个区域 */
:deep(.translatable-input-button) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  min-height: 2.5rem;
}

:deep(.translatable-input-button .p-splitbutton) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
}

:deep(.translatable-input-button .p-splitbutton-defaultbutton),
:deep(.translatable-input-button .p-splitbutton-menubutton) {
  height: 100%;
  min-height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem;
}

:deep(.translatable-input-button .p-splitbutton-defaultbutton) {
  flex: 1;
  min-width: 0;
}

:deep(.translatable-input-button .p-splitbutton-menubutton) {
  flex-shrink: 0;
  min-width: 2.5rem;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
