<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import type { Novel, Chapter } from 'src/models/novel';

export type TaskType = 'translation' | 'polish' | 'proofreading';

const props = defineProps<{
  visible: boolean;
  taskType: TaskType;
  book: Novel | null;
  chapter: Chapter | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (
    e: 'confirm',
    data: {
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ): void;
  (e: 'cancel'): void;
}>();

// 当前指令
const translationInstructions = ref('');
const polishInstructions = ref('');
const proofreadingInstructions = ref('');

// 获取当前任务类型的指令字段名
const currentInstructionField = computed(() => {
  switch (props.taskType) {
    case 'translation':
      return 'translationInstructions';
    case 'polish':
      return 'polishInstructions';
    case 'proofreading':
      return 'proofreadingInstructions';
    default:
      return 'translationInstructions';
  }
});

// 获取当前任务类型的指令值
const currentInstruction = computed(() => {
  switch (props.taskType) {
    case 'translation':
      return translationInstructions.value;
    case 'polish':
      return polishInstructions.value;
    case 'proofreading':
      return proofreadingInstructions.value;
    default:
      return translationInstructions.value;
  }
});

// 设置当前任务类型的指令值
const setCurrentInstruction = (value: string) => {
  switch (props.taskType) {
    case 'translation':
      translationInstructions.value = value;
      break;
    case 'polish':
      polishInstructions.value = value;
      break;
    case 'proofreading':
      proofreadingInstructions.value = value;
      break;
  }
};

// 获取任务类型标签
const taskTypeLabel = computed(() => {
  switch (props.taskType) {
    case 'translation':
      return '翻译';
    case 'polish':
      return '润色';
    case 'proofreading':
      return '校对';
    default:
      return '翻译';
  }
});

// 获取合并后的指令（章节级别覆盖书籍级别）
const getMergedInstructions = (
  field: 'translationInstructions' | 'polishInstructions' | 'proofreadingInstructions',
): string => {
  const chapterValue = props.chapter?.[field];
  const bookValue = props.book?.[field];
  return chapterValue || bookValue || '';
};

// 监听 visible 变化，初始化指令
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      // 从书籍和章节获取当前指令
      translationInstructions.value = getMergedInstructions('translationInstructions');
      polishInstructions.value = getMergedInstructions('polishInstructions');
      proofreadingInstructions.value = getMergedInstructions('proofreadingInstructions');
    }
  },
);

// 监听任务类型变化，更新当前指令显示
watch(
  () => props.taskType,
  () => {
    if (props.visible) {
      // 重新获取当前任务类型的指令
      const current = getMergedInstructions(currentInstructionField.value);
      setCurrentInstruction(current);
    }
  },
);

const handleConfirm = () => {
  const data: {
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  } = {};

  const trimmedTranslation = translationInstructions.value.trim();
  if (trimmedTranslation) {
    data.translationInstructions = trimmedTranslation;
  }

  const trimmedPolish = polishInstructions.value.trim();
  if (trimmedPolish) {
    data.polishInstructions = trimmedPolish;
  }

  const trimmedProofreading = proofreadingInstructions.value.trim();
  if (trimmedProofreading) {
    data.proofreadingInstructions = trimmedProofreading;
  }

  emit('confirm', data);
  emit('update:visible', false);
};

const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="`${taskTypeLabel}任务 - 特殊指令`"
    :style="{ width: '40rem' }"
    :draggable="false"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <p class="text-sm text-moon/80">
          这些指令将应用于当前{{ taskTypeLabel }}任务。章节级别的指令会覆盖书籍级别的指令。
        </p>
        <div v-if="chapter" class="text-xs text-moon/60">
          <p>当前章节：{{ chapter.title?.original || '未命名章节' }}</p>
        </div>
        <div v-if="book" class="text-xs text-moon/60">
          <p>当前书籍：{{ book.title }}</p>
        </div>
      </div>

      <!-- 翻译指令 -->
      <div class="space-y-2">
        <label for="translation-instructions" class="block text-sm font-medium text-moon/90"
          >翻译指令</label
        >
        <Textarea
          id="translation-instructions"
          v-model="translationInstructions"
          placeholder="输入翻译任务的特殊指令（可选）"
          :rows="4"
          :auto-resize="true"
          class="w-full"
        />
        <small class="text-moon/60 text-xs block"
          >这些指令将在执行翻译任务时添加到系统提示词中</small
        >
      </div>

      <!-- 润色指令 -->
      <div class="space-y-2">
        <label for="polish-instructions" class="block text-sm font-medium text-moon/90"
          >润色指令</label
        >
        <Textarea
          id="polish-instructions"
          v-model="polishInstructions"
          placeholder="输入润色任务的特殊指令（可选）"
          :rows="4"
          :auto-resize="true"
          class="w-full"
        />
        <small class="text-moon/60 text-xs block"
          >这些指令将在执行润色任务时添加到系统提示词中</small
        >
      </div>

      <!-- 校对指令 -->
      <div class="space-y-2">
        <label for="proofreading-instructions" class="block text-sm font-medium text-moon/90"
          >校对指令</label
        >
        <Textarea
          id="proofreading-instructions"
          v-model="proofreadingInstructions"
          placeholder="输入校对任务的特殊指令（可选）"
          :rows="4"
          :auto-resize="true"
          class="w-full"
        />
        <small class="text-moon/60 text-xs block"
          >这些指令将在执行校对任务时添加到系统提示词中</small
        >
      </div>
    </div>
    <template #footer>
      <Button label="取消" class="p-button-text" :disabled="loading" @click="handleCancel" />
      <Button
        :label="`开始${taskTypeLabel}`"
        :loading="loading"
        :disabled="loading"
        @click="handleConfirm"
      />
    </template>
  </Dialog>
</template>
