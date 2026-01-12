<template>
  <Dialog
    :visible="visible"
    header="AI 提问"
    :modal="true"
    :closable="false"
    :draggable="false"
    :resizable="false"
    :style="{ width: '100vw', height: '100vh' }"
    class="ask-user-dialog"
  >
    <div class="content">
      <div class="question">
        <div class="label">问题</div>
        <div class="text">{{ payload?.question }}</div>
      </div>

      <div v-if="suggestedAnswers.length > 0" class="suggested">
        <div class="label">推荐答案</div>
        <div class="buttons">
          <Button
            v-for="(ans, idx) in suggestedAnswers"
            :key="`${idx}-${ans}`"
            class="p-button-outlined"
            @click="selectAnswer(idx, ans)"
          >
            {{ ans }}
          </Button>
        </div>
      </div>

      <div v-if="allowFreeText" class="free-text">
        <div class="label">自定义答案</div>
        <Textarea
          v-model="freeText"
          :placeholder="payload?.placeholder || '请输入你的答案…'"
          auto-resize
          rows="4"
          class="w-full"
          @keydown.enter.exact.prevent="submitFreeText"
        />
        <div class="actions">
          <Button
            :label="payload?.submit_label || '提交'"
            icon="pi pi-check"
            :disabled="!freeText.trim()"
            @click="submitFreeText"
          />
          <Button
            :label="payload?.cancel_label || '取消'"
            icon="pi pi-times"
            severity="secondary"
            @click="cancel"
          />
        </div>
      </div>

      <div v-else class="actions">
        <Button
          :label="payload?.cancel_label || '取消'"
          icon="pi pi-times"
          severity="secondary"
          @click="cancel"
        />
      </div>
    </div>
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

const suggestedAnswers = computed(() => payload.value?.suggested_answers ?? []);
const allowFreeText = computed(() => payload.value?.allow_free_text !== false);

const freeText = ref('');

watch(
  () => payload.value?.question,
  () => {
    freeText.value = '';
  },
);

const selectAnswer = (index: number, answer: string) => {
  askUserStore.submitSelected(index, answer);
};

const submitFreeText = () => {
  askUserStore.submitFreeText(freeText.value);
};

const cancel = () => {
  askUserStore.cancel();
};
</script>

<style scoped>
.ask-user-dialog :deep(.p-dialog-content) {
  height: 100%;
  overflow: hidden;
  padding: 0;
}

.content {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  overflow: auto;
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

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.free-text {
  margin-top: auto;
}

.actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>

