<script setup lang="ts">
import { computed, ref } from 'vue';
import Chips from 'primevue/chips';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TranslationService } from 'src/services/ai';

interface Props {
  modelValue: string[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  separator?: string;
}

const props = withDefaults(defineProps<Props>(), {
  separator: ',',
});

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const aiModelsStore = useAIModelsStore();
const toast = useToastWithHistory();

// 翻译状态
const translating = ref(false);

// 翻译结果对话框状态
const showTranslationDialog = ref(false);
const translationResult = ref<string[]>([]);

// 获取所有可用的翻译模型
const availableTranslationModels = computed(() => {
  return aiModelsStore.models.filter(
    (model) => model.enabled && model.isDefault.translation?.enabled,
  );
});

// 是否禁用翻译按钮
const isTranslateDisabled = computed(() => {
  return (
    !props.modelValue || props.modelValue.length === 0 || translating.value || availableTranslationModels.value.length === 0
  );
});

// 翻译标签数组
const handleTranslate = async () => {
  if (!props.modelValue || props.modelValue.length === 0) {
    return;
  }

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

    // 将所有标签用中文顿号连接，然后翻译
    // 使用中文顿号是因为它更可能在翻译结果中保留
    const originalText = props.modelValue.join('、');
    
    // 使用翻译服务进行翻译
    const translatedText = await TranslationService.translate(originalText, selectedModel);

    // 尝试将翻译结果分割回数组
    // 翻译结果可能用中文顿号、中文逗号、英文逗号或其他分隔符分隔
    let translatedTags: string[] = [];
    
    // 尝试多种分隔符（按优先级排序）
    const separators = ['、', '，', ',', ' '];
    let foundSeparator = false;
    
    for (const sep of separators) {
      if (translatedText.includes(sep)) {
        translatedTags = translatedText
          .split(sep)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0);
        foundSeparator = true;
        break;
      }
    }
    
    // 如果没有找到分隔符，尝试按原始标签数量分割
    // 或者将整个文本作为一个标签
    if (!foundSeparator) {
      const originalCount = props.modelValue.length;
      // 如果原始只有一个标签，直接使用翻译结果
      if (originalCount === 1) {
        translatedTags = [translatedText.trim()].filter(tag => tag.length > 0);
      } else {
        // 如果有多个标签但翻译结果没有分隔符，尝试按字符数大致分割
        // 但这不太准确，所以还是作为一个标签处理
        translatedTags = [translatedText.trim()].filter(tag => tag.length > 0);
      }
    }
    
    // 确保翻译后的标签数量不超过原始标签数量（防止过度分割）
    if (translatedTags.length > props.modelValue.length * 2) {
      // 如果分割后标签过多，可能是分割方式不对，尝试用空格分割
      const spaceSplit = translatedText.split(/\s+/).map(tag => tag.trim()).filter(tag => tag.length > 0);
      if (spaceSplit.length <= props.modelValue.length * 2) {
        translatedTags = spaceSplit;
      }
    }

    // 保存翻译结果并显示对话框
    translationResult.value = translatedTags;
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
  <div class="translatable-chips-wrapper" :class="$attrs.class">
    <Chips
      :id="id"
      :model-value="modelValue"
      :placeholder="placeholder"
      :separator="separator"
      :disabled="disabled || translating"
      :class="{ 'p-invalid': invalid }"
      @update:model-value="(value: string[] | undefined) => emit('update:modelValue', value ?? [])"
    />
    <Button
      icon="pi pi-language"
      :loading="translating"
      :disabled="isTranslateDisabled"
      class="translatable-chips-button"
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
      <div class="translation-result-content">
        <div v-for="(tag, index) in translationResult" :key="index" class="translation-tag">
          {{ tag }}
        </div>
      </div>
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
            detail: '翻译结果已应用到标签',
            life: 3000,
          });
        "
      />
    </template>
  </Dialog>
</template>

<style scoped>
.translatable-chips-wrapper {
  position: relative;
  width: 100%;
}

.translatable-chips-wrapper :deep(.p-chips) {
  width: 100%;
}

.translatable-chips-wrapper :deep(.p-chips-multiple-container) {
  padding-right: 3rem !important;
}

.translatable-chips-button {
  position: absolute !important;
  top: 0.375rem !important;
  right: 0.375rem !important;
  width: 2rem !important;
  height: 2rem !important;
  min-width: 2rem !important;
  padding: 0 !important;
  margin: 0 !important;
  border-radius: 0.375rem !important;
  background: rgba(0, 0, 0, 0.5) !important;
  backdrop-filter: blur(4px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  z-index: 10 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: auto !important;
}

.translatable-chips-button :deep(.p-button-icon) {
  margin: 0 !important;
  color: rgba(246, 243, 209, 0.9) !important;
  font-size: 0.875rem !important;
}

.translatable-chips-button:not(:disabled):hover {
  background: rgba(85, 103, 242, 0.7) !important;
  border-color: rgba(85, 103, 242, 0.5) !important;
  box-shadow: 0 2px 8px rgba(85, 103, 242, 0.3) !important;
}

.translatable-chips-button:not(:disabled):active,
.translatable-chips-button:not(:disabled):focus {
  background: rgba(85, 103, 242, 0.8) !important;
  border-color: rgba(85, 103, 242, 0.6) !important;
  box-shadow: 0 2px 8px rgba(85, 103, 242, 0.4) !important;
}

.translatable-chips-button:not(:disabled):hover :deep(.p-button-icon),
.translatable-chips-button:not(:disabled):active :deep(.p-button-icon),
.translatable-chips-button:not(:disabled):focus :deep(.p-button-icon) {
  color: rgba(246, 243, 209, 1) !important;
}

.translatable-chips-button:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

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
  color: rgba(246, 243, 209, 0.95);
  margin-bottom: 0.25rem;
}

.translation-result-content {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.translation-tag {
  background: rgba(85, 103, 242, 0.2);
  border: 1px solid rgba(85, 103, 242, 0.4);
  color: rgba(246, 243, 209, 0.95);
  padding: 0.375rem 0.625rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

.translation-result-content::-webkit-scrollbar {
  width: 8px;
}

.translation-result-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.translation-result-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.translation-result-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.translation-result-question {
  font-size: 0.9375rem;
  color: rgba(246, 243, 209, 0.85);
  margin-top: 0.5rem;
}
</style>

