<script setup lang="ts">
import { computed, ref } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TranslationService } from 'src/services/ai';

interface Props {
  modelValue: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  type?: 'input' | 'textarea';
  rows?: number;
  autoResize?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'input',
  autoResize: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

// 计算 id，如果未提供则返回 undefined
const inputId = computed<string | undefined>(() => props.id);

const aiModelsStore = useAIModelsStore();
const toast = useToastWithHistory();

// 翻译状态
const translating = ref(false);

// 翻译结果对话框状态
const showTranslationDialog = ref(false);
const translationResult = ref('');

// 获取所有可用的翻译模型
const availableTranslationModels = computed(() => {
  return aiModelsStore.models.filter(
    (model) => model.enabled && model.isDefault.translation?.enabled,
  );
});

// 是否禁用翻译按钮
const isTranslateDisabled = computed(() => {
  return (
    !props.modelValue?.trim() || translating.value || availableTranslationModels.value.length === 0
  );
});

// 翻译文本
const handleTranslate = async () => {
  if (!props.modelValue?.trim()) {
    return;
  }

  const originalText = props.modelValue.trim();
  translating.value = true;

  try {
    // 获取默认的翻译模型
    const selectedModel = aiModelsStore.getDefaultModelForTask('translation');

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

    // 保存翻译结果并显示对话框
    translationResult.value = translatedText;
    showTranslationDialog.value = true;
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
  <!-- Input Text Mode -->
  <InputGroup v-if="type === 'input'">
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
    <InputGroupAddon class="translatable-input-addon">
      <Button
        icon="pi pi-language"
        :loading="translating"
        :disabled="isTranslateDisabled"
        class="translatable-input-button"
        @click="handleTranslate"
      />
    </InputGroupAddon>
  </InputGroup>
  <!-- Textarea Mode -->
  <div v-else class="translatable-textarea-wrapper">
    <Textarea
      v-if="inputId"
      :id="inputId as string"
      :model-value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :auto-resize="autoResize"
      class="translatable-textarea"
      :class="{ 'p-invalid': invalid }"
      :disabled="disabled || translating"
      @update:model-value="(value: string | undefined) => emit('update:modelValue', value ?? '')"
    />
    <Textarea
      v-else
      :model-value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :auto-resize="autoResize"
      class="translatable-textarea"
      :class="{ 'p-invalid': invalid }"
      :disabled="disabled || translating"
      @update:model-value="(value: string | undefined) => emit('update:modelValue', value ?? '')"
    />
    <Button
      icon="pi pi-language"
      :loading="translating"
      :disabled="isTranslateDisabled"
      class="translatable-textarea-button"
      @click="handleTranslate"
    />
  </div>
  <!-- 翻译结果对话框 -->
  <Dialog
    v-model:visible="showTranslationDialog"
    modal
    header="翻译完成"
    :style="{ width: '50rem', maxWidth: '90vw' }"
    class="translation-dialog"
  >
    <div class="translation-result-container">
      <div class="translation-result-label">翻译结果：</div>
      <div class="translation-result-content">{{ translationResult }}</div>
      <div class="translation-result-question">是否要应用此翻译？</div>
    </div>
    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text"
        @click="
          showTranslationDialog = false;
          toast.add({
            severity: 'info',
            summary: '已取消',
            detail: '翻译结果未应用',
            life: 2000,
          });
        "
      />
      <Button
        label="应用"
        icon="pi pi-check"
        class="p-button-primary"
        @click="
          emit('update:modelValue', translationResult);
          showTranslationDialog = false;
          toast.add({
            severity: 'success',
            summary: '翻译已应用',
            detail: '翻译结果已应用到输入框',
            life: 3000,
          });
        "
      />
    </template>
  </Dialog>
</template>

<style scoped>
/* Input Mode Styles */
.translatable-input-addon {
  padding: 0 !important;
  display: flex !important;
  align-items: stretch !important;
  position: relative !important;
}

.translatable-input-addon .translatable-input-button {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  min-width: auto !important;
  min-height: auto !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 0 !important;
}

.translatable-input-addon .translatable-input-button :deep(.p-button-icon) {
  margin: 0 !important;
  color: var(--moon-opacity-90) !important;
}

.translatable-input-addon .translatable-input-button:not(:disabled):hover {
  background: var(--primary-opacity-30) !important;
  border-color: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  transform: none !important;
}

.translatable-input-addon .translatable-input-button:not(:disabled):active,
.translatable-input-addon .translatable-input-button:not(:disabled):focus {
  background: var(--primary-opacity-30) !important;
  border-color: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  transform: none !important;
}

.translatable-input-addon .translatable-input-button:not(:disabled):hover :deep(.p-button-icon),
.translatable-input-addon .translatable-input-button:not(:disabled):active :deep(.p-button-icon),
.translatable-input-addon .translatable-input-button:not(:disabled):focus :deep(.p-button-icon) {
  color: var(--moon-opacity-100) !important;
  transform: none !important;
}

/* Textarea Mode Styles */
.translatable-textarea-wrapper {
  position: relative;
  width: 100%;
}

.translatable-textarea {
  width: 100%;
}

.translatable-textarea-button {
  position: absolute !important;
  top: 0.5rem !important;
  right: 0.5rem !important;
  width: 2rem !important;
  height: 2rem !important;
  min-width: 2rem !important;
  padding: 0 !important;
  margin: 0 !important;
  border-radius: 0.375rem !important;
  background: var(--black-opacity-50) !important;
  backdrop-filter: blur(4px) !important;
  border: 1px solid var(--white-opacity-10) !important;
  z-index: 10 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.translatable-textarea-button :deep(.p-button-icon) {
  margin: 0 !important;
  color: var(--moon-opacity-90) !important;
  font-size: 0.875rem !important;
}

.translatable-textarea-button:not(:disabled):hover {
  background: var(--primary-opacity-70) !important;
  border-color: var(--primary-opacity-50) !important;
  box-shadow: 0 2px 8px var(--primary-opacity-30) !important;
}

.translatable-textarea-button:not(:disabled):active,
.translatable-textarea-button:not(:disabled):focus {
  background: var(--primary-opacity-80) !important;
  border-color: var(--primary-opacity-60) !important;
  box-shadow: 0 2px 8px var(--primary-opacity-40) !important;
}

.translatable-textarea-button:not(:disabled):hover :deep(.p-button-icon),
.translatable-textarea-button:not(:disabled):active :deep(.p-button-icon),
.translatable-textarea-button:not(:disabled):focus :deep(.p-button-icon) {
  color: var(--moon-opacity-100) !important;
}

.translatable-textarea-button:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}
</style>

<style scoped>
/* 翻译结果对话框样式 */
.translation-result-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.translation-result-label {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  margin-bottom: 0.25rem;
}

.translation-result-content {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
  border-radius: 0.5rem;
  padding: 1rem;
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--moon-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.6;
  font-family: inherit;
}

.translation-result-content::-webkit-scrollbar {
  width: 8px;
}

.translation-result-content::-webkit-scrollbar-track {
  background: var(--white-opacity-5);
  border-radius: 4px;
}

.translation-result-content::-webkit-scrollbar-thumb {
  background: var(--white-opacity-20);
  border-radius: 4px;
}

.translation-result-content::-webkit-scrollbar-thumb:hover {
  background: var(--white-opacity-30);
}

.translation-result-question {
  font-size: 0.9375rem;
  color: var(--moon-opacity-85);
  margin-top: 0.5rem;
}
</style>
