<template>
  <Dialog
    :visible="visible"
    header="AI 提问"
    :modal="true"
    :closable="false"
    :draggable="false"
    :resizable="false"
    :style="{ width: 'min(920px, 92vw)', maxHeight: '88vh' }"
    class="ask-user-dialog"
  >
    <div class="content">
      <div v-if="isBatch" class="batch-header">
        <div class="batch-progress">
          第 {{ (batchProgress?.index ?? 0) + 1 }} / {{ batchProgress?.total ?? 0 }} 题
        </div>
      </div>

      <div class="question">
        <div class="label">问题</div>
        <div class="text">{{ payload?.question }}</div>
        <div v-if="isBatch && currentBatchAnswer" class="answered-hint">
          <span class="hint-label">已答：</span>
          <span class="hint-text">{{ currentBatchAnswer.answer }}</span>
        </div>
      </div>

      <div v-if="suggestedAnswers.length > 0" class="suggested">
        <div class="label">推荐答案</div>
        <div class="buttons">
          <Button
            v-for="(ans, idx) in suggestedAnswers"
            :key="`${idx}-${ans}`"
            class="p-button-outlined choice-button"
            :class="{ selected: selectedIndex === idx }"
            @click="selectOption(idx, ans)"
          >
            {{ formatChoiceLabel(idx, ans) }}
          </Button>
          <Button
            v-if="allowFreeText"
            class="p-button-outlined choice-button"
            severity="secondary"
            @click="selectOther"
          >
            {{ otherLabel }}
          </Button>
        </div>
      </div>

      <div v-if="showFreeTextArea" class="free-text">
        <div class="label">自定义答案</div>
        <Textarea
          v-model="freeText"
          :placeholder="payload?.placeholder || '请输入你的答案…'"
          auto-resize
          rows="4"
          class="w-full"
          :maxlength="typeof payload?.max_length === 'number' ? payload.max_length : undefined"
          @keydown.enter.exact.prevent="submit"
        />
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <Button
            v-if="isBatch"
            label="上一题"
            icon="pi pi-angle-left"
            severity="secondary"
            :disabled="!canPrev"
            @click="prev"
          />
          <Button
            v-if="isBatch"
            label="下一题"
            icon="pi pi-angle-right"
            icon-pos="right"
            severity="secondary"
            :disabled="!canNext"
            @click="next"
          />
        </div>

        <div class="footer-right">
          <Button
            :label="payload?.cancel_label || '取消'"
            icon="pi pi-times"
            severity="secondary"
            @click="cancel"
          />
          <Button
            v-if="showSubmitButton"
            :label="payload?.submit_label || (isBatch && isLastBatchQuestion ? '完成' : '提交')"
            icon="pi pi-check"
            :disabled="!canSubmit"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
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

const choiceLetter = (index: number): string => {
  if (!Number.isFinite(index) || index < 0) return '#';
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < base.length) return base[index] ?? '#';
  return `#${index + 1}`;
};

const formatChoiceLabel = (index: number, answer: string): string => {
  return `${choiceLetter(index)}: ${answer}`;
};

watch(
  () => payload.value?.question,
  () => {
    const existing = currentBatchAnswer.value?.answer;
    // 重置 Other 选择状态
    isOtherSelected.value = false;
    selectedIndex.value = null;
    selectedAnswer.value = '';

    // batch：若本题已答，尝试回填；如果答案不在候选中，则视为 Other
    if (isBatch.value && typeof existing === 'string') {
      const inSuggested = suggestedAnswers.value.includes(existing);
      if (!inSuggested && allowFreeText.value) {
        isOtherSelected.value = true;
        freeText.value = existing;
      } else {
        const idx = suggestedAnswers.value.findIndex((x) => x === existing);
        selectedIndex.value = idx >= 0 ? idx : null;
        selectedAnswer.value = existing;
        freeText.value = '';
      }
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

.dialog-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.footer-right {
  margin-left: auto;
  justify-content: flex-end;
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

.buttons {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.choice-button {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

.choice-button :deep(.p-button-label) {
  white-space: normal;
  text-align: left;
  line-height: 1.4;
}

.choice-button.selected {
  border-color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.08);
}

.free-text {
  margin-top: auto;
}
</style>
