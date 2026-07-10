<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import InputChips from 'primevue/inputchips';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import Checkbox from 'primevue/checkbox';
import { useTermTranslation } from 'src/composables/translation/useTermTranslation';

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

// 术语翻译共享逻辑（状态 / 可用模型 / 请求封装）
const { translating, thinkingMessage, availableTranslationModels, runTermTranslation, toast } =
  useTermTranslation();

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
    selectedTagIndices.value = new Set();
  } else {
    selectedTagIndices.value = new Set(translationResult.value.map((_, index) => index));
  }
};

// 切换单个标签的选择状态
const toggleTagSelection = (index: number) => {
  const newSet = new Set(selectedTagIndices.value);
  if (newSet.has(index)) {
    newSet.delete(index);
  } else {
    newSet.add(index);
  }
  selectedTagIndices.value = newSet;
};

// 处理复选框更新事件
const handleCheckboxChange = (index: number, value: boolean) => {
  const newSet = new Set(selectedTagIndices.value);
  if (value) {
    newSet.add(index);
  } else {
    newSet.delete(index);
  }
  selectedTagIndices.value = newSet;
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

// 是否禁用翻译按钮（数组语境下要求非空）
const isTranslateDisabled = computed(() => {
  return (
    !props.modelValue ||
    props.modelValue.length === 0 ||
    translating.value ||
    availableTranslationModels.value.length === 0
  );
});

// 翻译结果分隔符优先级（中文顿号 > 中文逗号 > 英文逗号 > 空格）
const TRANSLATION_SEPARATORS = ['、', '，', ',', ' '];

const splitAndClean = (text: string, separator: string): string[] =>
  text
    .split(separator)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

// 将翻译结果文本切分为标签数组：
// 1. 按优先级尝试已知分隔符；
// 2. 找不到分隔符时整体作为一个标签（原实现中 originalCount===1 与否结果一致）；
// 3. 若结果远超原始数量（>2 倍），尝试用空格再切分一次兜底过度合并
const splitTranslatedText = (translatedText: string, originalCount: number): string[] => {
  let tags: string[] = [];
  let foundSeparator = false;

  for (const sep of TRANSLATION_SEPARATORS) {
    if (translatedText.includes(sep)) {
      tags = splitAndClean(translatedText, sep);
      foundSeparator = true;
      break;
    }
  }

  if (!foundSeparator) {
    tags = [translatedText.trim()].filter((tag) => tag.length > 0);
  }

  if (tags.length > originalCount * 2) {
    const spaceSplit = translatedText
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (spaceSplit.length <= originalCount * 2) {
      tags = spaceSplit;
    }
  }

  return tags;
};

// 翻译标签数组
const handleTranslate = async () => {
  if (!props.modelValue || props.modelValue.length === 0) {
    return;
  }

  // 将所有标签用中文顿号连接，然后翻译
  // 使用中文顿号是因为它更可能在翻译结果中保留
  const originalText = props.modelValue.join('、');

  const translatedText = await runTermTranslation(originalText);

  // 失败时 composable 已处理（toast / console.error），这里直接返回
  if (translatedText === null) {
    return;
  }

  try {
    const translatedTags = splitTranslatedText(translatedText, props.modelValue.length);

    // 保存原始标签和翻译结果，然后显示对话框
    originalTags.value = [...props.modelValue];
    translationResult.value = translatedTags;
    showTranslationDialog.value = true;
  } catch (error) {
    // 这里只会是本地分隔符解析阶段的意外错误；翻译请求错误已在 composable 内捕获
    console.error('解析翻译结果时出错:', error);
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
        class="translatable-icon-button translatable-chips-button"
        @click="handleTranslate"
      />
      <div v-if="translating && thinkingMessage" class="translatable-chips-thinking">
        <span class="translatable-chips-thinking-text">{{ thinkingMessage }}</span>
      </div>
    </div>
  </div>

  <!-- 翻译结果对话框 -->
  <AdaptiveDialog
    v-model:visible="showTranslationDialog"
    header="翻译完成"
    desktop-width="50rem"
    eyebrow="TRANSLATION"
    dialog-class="translation-dialog"
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
            @update:model-value="(val) => handleCheckboxChange(index, val as boolean)"
            @click.stop
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
  </AdaptiveDialog>
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

/* 仅保留定位相关属性，外观样式见 translatable.css 的 .translatable-icon-button */
.translatable-chips-button {
  position: relative !important;
  pointer-events: auto !important;
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

/* 翻译结果对话框样式（.translation-result-container / 滚动条 / 提问文案见 translatable.css） */
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

.translation-result-info {
  font-size: 0.875rem;
  color: var(--moon-opacity-70);
  margin-top: 0.5rem;
}

.translation-result-info strong {
  color: var(--primary-opacity-100);
  font-weight: 600;
}
</style>

<style scoped src="./translatable.css"></style>
