<template>
  <AdaptiveDialog
    :visible="visible"
    header="AI 提问"
    desktop-width="min(920px, 92vw)"
    desktop-height="88vh"
    eyebrow="AI · ASK"
    :closable="false"
    :dismissable-mask="false"
    :close-on-escape="false"
    :sheet-dismiss-on-mask-click="false"
    dialog-class="ask-user-dialog"
  >
    <div class="content">
      <div v-if="isBatch" class="batch-header">
        <div class="batch-progress">
          {{ batchProgressText }}
        </div>
      </div>

      <div class="question">
        <div class="label">问题</div>
        <div class="text">{{ question }}</div>
        <div v-if="showAnsweredHint" class="answered-hint">
          <span class="hint-label">已答：</span>
          <span class="hint-text">{{ answeredHintText }}</span>
        </div>
      </div>

      <AskUserChoices
        :suggested-answers="suggestedAnswers"
        :selected-index="selectedIndex"
        :allow-free-text="allowFreeText"
        :other-label="otherLabel"
        @select="selectOption"
        @other="selectOther"
      />

      <div v-if="showFreeTextArea" class="free-text">
        <div class="label">自定义答案</div>
        <Textarea
          v-model="freeText"
          :placeholder="freeTextPlaceholder"
          auto-resize
          rows="4"
          class="w-full"
          :maxlength="freeTextMaxlength"
          @keydown.enter.exact.prevent="submit"
        />
      </div>
    </div>

    <template #footer>
      <AskUserFooter
        :is-batch="isBatch"
        :can-prev="canPrev"
        :can-next="canNext"
        :show-submit-button="showSubmitButton"
        :can-submit="canSubmit"
        :cancel-label="cancelLabel"
        :submit-label="submitLabel"
        @prev="prev"
        @next="next"
        @cancel="cancel"
        @submit="submit"
      />
    </template>
  </AdaptiveDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Textarea from 'primevue/textarea';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import AskUserChoices from './AskUserChoices.vue';
import AskUserFooter from './AskUserFooter.vue';
import { useAskUserStore } from 'src/stores/ask-user';

const askUserStore = useAskUserStore();

const visible = computed(() => askUserStore.isVisible);
const payload = computed(() => askUserStore.currentPayload);
const mode = computed(() => askUserStore.currentMode);
const isBatch = computed(() => mode.value === 'batch');
const batchProgress = computed(() => askUserStore.currentBatchProgress);
const currentBatchAnswer = computed(() => askUserStore.currentBatchAnswer);
const isLastBatchQuestion = computed(() => {
  if (!isBatch.value || !batchProgress.value) return false;
  return batchProgress.value.index >= batchProgress.value.total - 1;
});
const canPrev = computed(() => !!batchProgress.value && batchProgress.value.index > 0);
const canNext = computed(() => {
  if (!isBatch.value || !batchProgress.value) return false;
  if (batchProgress.value.index >= batchProgress.value.total - 1) return false;
  return askUserStore.isCurrentBatchAnswered;
});

const suggestedAnswers = computed(() => payload.value?.suggested_answers ?? []);
const allowFreeText = computed(() => payload.value?.allow_free_text !== false);

const freeText = ref('');
const isOtherSelected = ref(false);
const selectedIndex = ref<number | null>(null);
const selectedAnswer = ref('');

const otherLabel = 'Other：自定义输入';

const showFreeTextArea = computed(() => {
  if (!allowFreeText.value) return false;
  // 没有候选答案时，直接显示输入框
  if (suggestedAnswers.value.length === 0) return true;
  // 有候选答案时，选择“Other”才展开输入框
  return isOtherSelected.value;
});

const showSubmitButton = computed(() => {
  // 用户要求：点选后需要“提交”确认，因此只要存在可提交内容就显示提交按钮
  return showFreeTextArea.value || selectedIndex.value !== null;
});

const canSubmit = computed(() => {
  if (showFreeTextArea.value) return !!freeText.value.trim();
  return selectedIndex.value !== null && !!selectedAnswer.value;
});

// 模板展示用的派生值（将 ?. / || / 三元收敛到 computed，降低模板圈复杂度）
const question = computed(() => payload.value?.question);
const showAnsweredHint = computed(() => isBatch.value && !!currentBatchAnswer.value);
const answeredHintText = computed(() => currentBatchAnswer.value?.answer ?? '');
const batchProgressText = computed(
  () => `第 ${(batchProgress.value?.index ?? 0) + 1} / ${batchProgress.value?.total ?? 0} 题`,
);
const cancelLabel = computed(() => payload.value?.cancel_label || '取消');
const submitLabel = computed(
  () =>
    payload.value?.submit_label || (isBatch.value && isLastBatchQuestion.value ? '完成' : '提交'),
);
const freeTextPlaceholder = computed(() => payload.value?.placeholder || '请输入你的答案…');
const freeTextMaxlength = computed(() =>
  typeof payload.value?.max_length === 'number' ? payload.value.max_length : undefined,
);

// batch 模式：回填已答内容。答案不在候选中且允许自由输入时视为 Other
const prefillBatchAnswer = (existing: string) => {
  const inSuggested = suggestedAnswers.value.includes(existing);
  if (!inSuggested && allowFreeText.value) {
    isOtherSelected.value = true;
    freeText.value = existing;
    return;
  }
  const idx = suggestedAnswers.value.findIndex((x) => x === existing);
  selectedIndex.value = idx >= 0 ? idx : null;
  selectedAnswer.value = existing;
  freeText.value = '';
};

watch(
  () => payload.value?.question,
  () => {
    const existing = currentBatchAnswer.value?.answer;
    // 重置 Other 选择状态
    isOtherSelected.value = false;
    selectedIndex.value = null;
    selectedAnswer.value = '';

    // batch：若本题已答，尝试回填
    if (isBatch.value && typeof existing === 'string') {
      prefillBatchAnswer(existing);
      return;
    }

    // single：无候选答案但允许自由输入时，默认展开输入框
    if (!isBatch.value && allowFreeText.value && suggestedAnswers.value.length === 0) {
      isOtherSelected.value = true;
      freeText.value = '';
      return;
    }

    freeText.value = '';
  },
);

const selectOption = (index: number, answer: string) => {
  isOtherSelected.value = false;
  freeText.value = '';
  selectedIndex.value = index;
  selectedAnswer.value = answer;
};

const submit = () => {
  if (!canSubmit.value) return;
  if (showFreeTextArea.value) {
    askUserStore.submitFreeText(freeText.value);
    return;
  }
  if (selectedIndex.value === null) return;
  askUserStore.submitSelected(selectedIndex.value, selectedAnswer.value);
};

const selectOther = () => {
  if (!allowFreeText.value) return;
  isOtherSelected.value = true;
  selectedIndex.value = null;
  selectedAnswer.value = '';
};

const prev = () => {
  askUserStore.prevBatchQuestion();
};

const next = () => {
  askUserStore.nextBatchQuestion();
};

const cancel = () => {
  askUserStore.cancel();
};
</script>

<style scoped>
.ask-user-dialog :deep(.p-dialog-content) {
  max-height: 88vh;
  overflow: auto;
  padding: 0;
}

.ask-user-dialog :deep(.p-dialog-footer) {
  padding: 12px 16px;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  min-height: 0;
}

.batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.batch-progress {
  font-size: 12px;
  opacity: 0.8;
}

.label {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 6px;
}

.question .text {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  white-space: pre-wrap;
}

.answered-hint {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.hint-label {
  font-size: 12px;
  opacity: 0.7;
  margin-right: 6px;
}

.hint-text {
  font-size: 13px;
  white-space: pre-wrap;
}

.free-text {
  margin-top: auto;
}
</style>
