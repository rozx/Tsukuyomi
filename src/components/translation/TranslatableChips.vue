<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import InputChips from 'primevue/inputchips';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Checkbox from 'primevue/checkbox';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TermTranslationService } from 'src/services/ai';

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
const aiProcessingStore = useAIProcessingStore();
const toast = useToastWithHistory();

// 翻译状态
const translating = ref(false);
// 当前翻译任务 ID
const currentTaskId = ref<string | null>(null);
// 思考过程消息（只显示当前任务的）
const thinkingMessage = computed(() => {
  if (!currentTaskId.value) return null;
  const task = aiProcessingStore.activeTasks.find((t) => t.id === currentTaskId.value);
  if (!task) return null;

  // 优先使用实际的思考消息
  if (task.thinkingMessage && task.thinkingMessage.trim()) {
    // 获取最后一行
    const lines = task.thinkingMessage.split('\n').filter((line) => line.trim());
    return lines.length > 0 ? lines[lines.length - 1] : task.thinkingMessage;
  }

  return task.message || `${task.modelName} 正在处理...`;
});

// 翻译结果对话框状态
const showTranslationDialog = ref(false);
const translationResult = ref<string[]>([]);
const selectedTagIndices = ref<Set<number>>(new Set());
const originalTags = ref<string[]>([]); // 保存翻译前的原始标签

// 监听翻译结果变化，默认全选
watch(translationResult, (newResult) => {
  if (newResult.length > 0) {
    selectedTagIndices.value = new Set(newResult.map((_, index) => index));
  } else {
    selectedTagIndices.value = new Set();
  }
});

// 是否全选
const isAllSelected = computed(() => {
  return (
    translationResult.value.length > 0 &&
    selectedTagIndices.value.size === translationResult.value.length
  );
});

// 切换全选/取消全选
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedTagIndices.value.clear();
  } else {
    selectedTagIndices.value = new Set(translationResult.value.map((_, index) => index));
  }
};

// 切换单个标签的选择状态
const toggleTagSelection = (index: number) => {
  if (selectedTagIndices.value.has(index)) {
    selectedTagIndices.value.delete(index);
  } else {
    selectedTagIndices.value.add(index);
  }
};

// 获取选中的标签及其索引映射
const getSelectedTagsWithIndices = computed(() => {
  const result: Array<{ tag: string; translationIndex: number }> = [];
  selectedTagIndices.value.forEach((translationIndex) => {
    const tag = translationResult.value[translationIndex];
    if (tag !== undefined && translationIndex < translationResult.value.length) {
      result.push({
        tag,
        translationIndex,
      });
    }
  });
  return result.sort((a, b) => a.translationIndex - b.translationIndex);
});

// 应用选中的翻译结果，按位置替换原始标签
const applySelectedTranslations = () => {
  if (selectedTagIndices.value.size === 0) {
    return null;
  }

  // 确保原始标签已初始化（如果为空，使用当前的 modelValue 作为后备）
  const baseTags = originalTags.value.length > 0 ? originalTags.value : props.modelValue;

  // 创建新数组，从原始标签开始（保留所有原始标签）
  const updatedTags = [...baseTags];
  const selectedWithIndices = getSelectedTagsWithIndices.value;

  if (selectedWithIndices.length === 0) {
    return updatedTags;
  }

  // 按翻译结果的索引对应替换原始标签
  // 只替换索引在原始标签范围内的翻译结果
  let replacedCount = 0;
  selectedWithIndices.forEach(({ tag, translationIndex }) => {
    // 只有当翻译结果的索引在原始标签范围内时，才替换对应位置的标签
    if (translationIndex >= 0 && translationIndex < updatedTags.length) {
      updatedTags[translationIndex] = tag;
      replacedCount++;
    }
    // 如果翻译结果索引超出原始标签范围，不替换（保留原始标签）
  });

  return updatedTags;
};

// 处理应用翻译按钮点击
const handleApplyTranslation = () => {
  if (selectedTagIndices.value.size === 0) {
    toast.add({
      severity: 'warn',
      summary: '未选择标签',
      detail: '请至少选择一个翻译结果',
      life: 2000,
    });
    return;
  }

  try {
    const updatedTags = applySelectedTranslations();
    if (!updatedTags) {
      toast.add({
        severity: 'error',
        summary: '应用失败',
        detail: '无法生成更新后的标签',
        life: 3000,
      });
      return;
    }

    emit('update:modelValue', updatedTags);
    showTranslationDialog.value = false;
    toast.add({
      severity: 'success',
      summary: '翻译已应用',
      detail: `已替换 ${selectedTagIndices.value.size} 个标签`,
      life: 3000,
    });
  } catch (error) {
    console.error('应用翻译时出错:', error);
    toast.add({
      severity: 'error',
      summary: '应用失败',
      detail: error instanceof Error ? error.message : '应用翻译时发生未知错误',
      life: 3000,
    });
  }
};

// 获取所有可用的术语翻译模型
const availableTranslationModels = computed(() => {
  return aiModelsStore.models.filter(
    (model) => model.enabled && model.isDefault.termsTranslation?.enabled,
  );
});

// 是否禁用翻译按钮
const isTranslateDisabled = computed(() => {
  return (
    !props.modelValue ||
    props.modelValue.length === 0 ||
    translating.value ||
    availableTranslationModels.value.length === 0
  );
});

// 翻译标签数组
const handleTranslate = async () => {
  if (!props.modelValue || props.modelValue.length === 0) {
    return;
  }

  translating.value = true;

  // 获取默认的术语翻译模型
  const selectedModel = aiModelsStore.getDefaultModelForTask('termsTranslation');

  if (!selectedModel) {
    toast.add({
      severity: 'error',
      summary: '翻译失败',
      detail: '未找到可用的术语翻译模型，请在设置中配置',
      life: 3000,
    });
    translating.value = false;
    return;
  }

  try {
    // 将所有标签用中文顿号连接，然后翻译
    // 使用中文顿号是因为它更可能在翻译结果中保留
    const originalText = props.modelValue.join('、');

    // 使用翻译服务进行翻译，服务会自动管理任务
    const result = await TermTranslationService.translate(originalText, selectedModel, {
      taskType: 'termsTranslation',
      aiProcessingStore: {
        addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
        updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
        appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
        appendOutputContent: aiProcessingStore.appendOutputContent.bind(aiProcessingStore),
        removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
        activeTasks: aiProcessingStore.activeTasks,
      },
    });

    // 保存任务 ID 以便跟踪
    if (result.taskId) {
      currentTaskId.value = result.taskId;
    }

    const translatedText = result.text;

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
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
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
        translatedTags = [translatedText.trim()].filter((tag) => tag.length > 0);
      } else {
        // 如果有多个标签但翻译结果没有分隔符，尝试按字符数大致分割
        // 但这不太准确，所以还是作为一个标签处理
        translatedTags = [translatedText.trim()].filter((tag) => tag.length > 0);
      }
    }

    // 确保翻译后的标签数量不超过原始标签数量（防止过度分割）
    if (translatedTags.length > props.modelValue.length * 2) {
      // 如果分割后标签过多，可能是分割方式不对，尝试用空格分割
      const spaceSplit = translatedText
        .split(/\s+/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      if (spaceSplit.length <= props.modelValue.length * 2) {
        translatedTags = spaceSplit;
      }
    }

    // 保存原始标签和翻译结果，然后显示对话框
    originalTags.value = [...props.modelValue];
    translationResult.value = translatedTags;
    showTranslationDialog.value = true;
  } catch (error) {
    console.error('翻译失败:', error);
    // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
  } finally {
    translating.value = false;
    // 任务移除已由服务管理，这里只需要清理本地引用
    currentTaskId.value = null;
  }
};
</script>

<template>
  <div class="translatable-chips-wrapper" :class="$attrs.class">
    <InputChips
      :id="id"
      :model-value="modelValue"
      :placeholder="placeholder"
      :separator="separator"
      :disabled="disabled || translating"
      :class="{ 'p-invalid': invalid }"
      @update:model-value="(value: string[] | undefined) => emit('update:modelValue', value ?? [])"
    />
    <div class="translatable-chips-button-wrapper">
      <Button
        icon="pi pi-language"
        :loading="translating"
        :disabled="isTranslateDisabled"
        class="translatable-chips-button"
        @click="handleTranslate"
      />
      <div v-if="translating && thinkingMessage" class="translatable-chips-thinking">
        <span class="translatable-chips-thinking-text">{{ thinkingMessage }}</span>
      </div>
    </div>
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
      <div class="translation-result-header">
        <div class="translation-result-label">翻译结果：</div>
        <Button
          :label="isAllSelected ? '取消全选' : '全选'"
          icon="pi pi-check-square"
          class="p-button-text p-button-sm"
          @click="toggleSelectAll"
        />
      </div>
      <div class="translation-result-content">
        <div
          v-for="(tag, index) in translationResult"
          :key="index"
          class="translation-tag"
          :class="{ 'translation-tag-selected': selectedTagIndices.has(index) }"
          @click="toggleTagSelection(index)"
        >
          <Checkbox
            :model-value="selectedTagIndices.has(index)"
            :binary="true"
            @click.stop="toggleTagSelection(index)"
            class="translation-tag-checkbox"
          />
          <span class="translation-tag-text">{{ tag }}</span>
        </div>
      </div>
      <div class="translation-result-info">
        已选择 <strong>{{ selectedTagIndices.size }}</strong> /
        {{ translationResult.length }} 个标签
      </div>
      <div class="translation-result-question">是否要应用选中的翻译？</div>
    </div>
    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text"
        @click="showTranslationDialog = false"
      />
      <Button
        label="应用"
        icon="pi pi-check"
        class="p-button-primary"
        :disabled="selectedTagIndices.size === 0"
        @click="handleApplyTranslation"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.translatable-chips-wrapper {
  position: relative;
  width: 100%;
}

.translatable-chips-wrapper :deep(.p-inputchips) {
  width: 100%;
}

.translatable-chips-wrapper :deep(.p-inputchips-input-token) {
  width: 100% !important;
}

.translatable-chips-wrapper :deep(.p-inputchips-input) {
  padding-right: 3rem !important;
}

.translatable-chips-button {
  position: relative !important;
  width: 2rem !important;
  height: 2rem !important;
  min-width: 2rem !important;
  padding: 0 !important;
  margin: 0 !important;
  border-radius: 0.375rem !important;
  background: var(--black-opacity-50) !important;
  backdrop-filter: blur(4px) !important;
  border: 1px solid var(--white-opacity-10) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: auto !important;
}

.translatable-chips-button :deep(.p-button-icon) {
  margin: 0 !important;
  color: var(--moon-opacity-90) !important;
  font-size: 0.875rem !important;
}

.translatable-chips-button:not(:disabled):hover {
  background: var(--primary-opacity-70) !important;
  border-color: var(--primary-opacity-50) !important;
  box-shadow: 0 2px 8px var(--primary-opacity-30) !important;
}

.translatable-chips-button:not(:disabled):active,
.translatable-chips-button:not(:disabled):focus {
  background: var(--primary-opacity-80) !important;
  border-color: var(--primary-opacity-60) !important;
  box-shadow: 0 2px 8px var(--primary-opacity-40) !important;
}

.translatable-chips-button:not(:disabled):hover :deep(.p-button-icon),
.translatable-chips-button:not(:disabled):active :deep(.p-button-icon),
.translatable-chips-button:not(:disabled):focus :deep(.p-button-icon) {
  color: var(--moon-opacity-100) !important;
}

.translatable-chips-button:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

.translatable-chips-button-wrapper {
  position: absolute !important;
  top: 0.375rem !important;
  right: 0.375rem !important;
  z-index: 10 !important;
}

.translatable-chips-thinking {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: var(--black-opacity-80);
  backdrop-filter: blur(4px);
  border: 1px solid var(--white-opacity-10);
  border-radius: 0.375rem;
  white-space: nowrap;
  z-index: 1000;
  font-size: 0.75rem;
  color: var(--moon-opacity-90);
  box-shadow: 0 2px 8px var(--black-opacity-50);
}

.translatable-chips-thinking-text {
  line-height: 1;
}

/* 翻译结果对话框样式 */
.translation-result-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.translation-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.translation-result-label {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.translation-result-content {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
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
  background: var(--primary-opacity-20);
  border: 1px solid var(--primary-opacity-40);
  color: var(--moon-opacity-95);
  padding: 0.375rem 0.625rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.translation-tag:hover {
  background: var(--primary-opacity-30);
  border-color: var(--primary-opacity-60);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--primary-opacity-20);
}

.translation-tag-selected {
  background: var(--primary-opacity-40);
  border-color: var(--primary-opacity-70);
  box-shadow: 0 0 0 2px var(--primary-opacity-30);
}

.translation-tag-checkbox {
  flex-shrink: 0;
}

.translation-tag-text {
  flex: 1;
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

.translation-result-info {
  font-size: 0.875rem;
  color: var(--moon-opacity-70);
  margin-top: 0.5rem;
}

.translation-result-info strong {
  color: var(--primary-opacity-100);
  font-weight: 600;
}

.translation-result-question {
  font-size: 0.9375rem;
  color: var(--moon-opacity-85);
  margin-top: 0.5rem;
}
</style>
