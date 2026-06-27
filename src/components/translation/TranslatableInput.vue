<script setup lang="ts">
import { computed, ref } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import ProgressSpinner from 'primevue/progressspinner';
import { useTermTranslation } from 'src/composables/translation/useTermTranslation';

interface Props {
  modelValue: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  type?: 'input' | 'textarea';
  rows?: number;
  autoResize?: boolean;
  /**
   * 是否将翻译结果应用到输入框
   * 如果为 false，翻译结果只会通过 translation-applied 事件传递，不会更新 modelValue
   * @default true
   */
  applyTranslationToInput?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'input',
  autoResize: false,
  applyTranslationToInput: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'translation-applied': [value: string];
  keyup: [event: KeyboardEvent];
}>();

// 计算 id，如果未提供则返回 undefined（:id="undefined" 不渲染 id 属性，
// 与原先 v-if="inputId" 二选一两份模板的渲染结果完全一致）
const inputId = computed<string | undefined>(() => props.id);

// 术语翻译共享逻辑（状态 / 可用模型 / 请求封装）
const { translating, thinkingMessage, availableTranslationModels, runTermTranslation, toast } =
  useTermTranslation();

// 翻译结果对话框状态
const showTranslationDialog = ref(false);
const translationResult = ref('');

// 输入框统一禁用条件（合并到 computed，避免模板里出现 || 逻辑运算符）
const fieldDisabled = computed(() => props.disabled || translating.value);

// 是否禁用翻译按钮（单行字符串语境下还要求 trim 非空）
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
  const translatedText = await runTermTranslation(originalText);

  // 失败时 composable 已处理（toast / console.error），这里直接返回
  if (translatedText === null) {
    return;
  }

  // 保存翻译结果并显示对话框
  translationResult.value = translatedText;
  showTranslationDialog.value = true;
};

// 应用翻译结果：按 applyTranslationToInput 决定是否回填输入框，并关闭对话框 + 成功 toast
const applyTranslationResult = () => {
  emit('translation-applied', translationResult.value);
  if (props.applyTranslationToInput) {
    emit('update:modelValue', translationResult.value);
  }
  showTranslationDialog.value = false;
  toast.add({
    severity: 'success',
    summary: '翻译已应用',
    detail: props.applyTranslationToInput ? '翻译结果已应用到输入框' : '翻译完成',
    life: 3000,
  });
};
</script>

<template>
  <!-- Input Text Mode -->
  <InputGroup v-if="type === 'input'">
    <InputText
      :id="inputId"
      :model-value="modelValue"
      :placeholder="placeholder"
      class="flex-1"
      :class="{ 'p-invalid': invalid }"
      :disabled="fieldDisabled"
      @update:model-value="(value: string | undefined) => emit('update:modelValue', value ?? '')"
      @keyup="$emit('keyup', $event)"
    />
    <InputGroupAddon class="translatable-input-addon">
      <div class="translatable-input-addon-content">
        <Button
          icon="pi pi-language"
          :loading="translating"
          :disabled="isTranslateDisabled"
          class="translatable-input-button"
          @click="handleTranslate"
        />
        <div v-if="translating && thinkingMessage" class="translatable-input-thinking">
          <ProgressSpinner style="width: 0.75rem; height: 0.75rem" stroke-width="3" />
          <span class="translatable-input-thinking-text">{{ thinkingMessage }}</span>
        </div>
      </div>
    </InputGroupAddon>
  </InputGroup>
  <!-- Textarea Mode -->
  <div v-else class="translatable-textarea-wrapper">
    <Textarea
      :id="inputId"
      :model-value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :auto-resize="autoResize"
      class="translatable-textarea"
      :class="{ 'p-invalid': invalid }"
      :disabled="fieldDisabled"
      @update:model-value="(value: string | undefined) => emit('update:modelValue', value ?? '')"
      @keyup="$emit('keyup', $event)"
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
  <AdaptiveDialog
    v-model:visible="showTranslationDialog"
    header="翻译完成"
    desktop-width="50rem"
    eyebrow="TRANSLATION"
    dialog-class="translation-dialog"
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
        @click="showTranslationDialog = false"
      />
      <Button
        label="应用"
        icon="pi pi-check"
        class="p-button-primary"
        @click="applyTranslationResult"
      />
    </template>
  </AdaptiveDialog>
</template>

<style scoped>
/* Input Mode Styles */
.translatable-input-addon {
  padding: 0 !important;
  display: flex !important;
  align-items: stretch !important;
  position: relative !important;
}

.translatable-input-addon-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

.translatable-input-thinking {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: var(--black-opacity-80);
  backdrop-filter: blur(4px);
  border: 1px solid var(--white-opacity-10);
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  z-index: 1000;
  font-size: 0.75rem;
  color: var(--moon-opacity-90);
  box-shadow: 0 2px 8px var(--black-opacity-50);
}

.translatable-input-thinking-text {
  line-height: 1;
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
