<script setup lang="ts">
/**
 * 导入任务的必要问题：多小说选择或月詠的提问。回答绑定当前任务与问题；
 * 关闭或忽略不会解除等待，部分回答也不会被接受。
 */
import { computed, reactive, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const store = useImportWorkspaceStore();
const question = computed(() => store.task?.pendingQuestion);
const busy = computed(() => ['answer', 'choose-novel'].includes(store.pendingAction ?? ''));

const selectedNovel = reactive({ id: '' });
const answers = reactive<Record<number, { text: string; selectedIndex?: number }>>({});
watch(
  () => question.value?.id,
  () => {
    selectedNovel.id = '';
    for (const key of Object.keys(answers)) delete answers[Number(key)];
    question.value?.items?.forEach((_, index) => {
      answers[index] = { text: '' };
    });
  },
  { immediate: true },
);

const pick = (index: number, choice: number, label: string) => {
  answers[index] = { text: label, selectedIndex: choice };
};
const typed = (index: number, text: string) => {
  answers[index] = { text };
};

const complete = computed(() =>
  (question.value?.items ?? []).every((_, index) => answers[index]?.text.trim()),
);

const submit = () => {
  const items = question.value?.items ?? [];
  void store.answerQuestion(
    items.map((_, index) => ({
      questionIndex: index,
      answer: answers[index]!.text.trim(),
      ...(answers[index]!.selectedIndex !== undefined
        ? { selectedIndex: answers[index]!.selectedIndex }
        : {}),
    })),
  );
};
</script>

<template>
  <div v-if="question && !question.answer" class="iqc" role="group" aria-label="待回答的问题">
    <div class="iqc-head">
      <i class="pi pi-question-circle" aria-hidden="true" />
      <span>{{ question.kind === 'novel' ? '请选择本次导入的小说' : '月詠在等你回答' }}</span>
    </div>

    <template v-if="question.kind === 'novel'">
      <p class="iqc-text">{{ question.question }}</p>
      <label v-for="option in question.options" :key="option.id" class="iqc-option">
        <RadioButton v-model="selectedNovel.id" :value="option.id" name="import-novel" />
        <span>{{ option.label }}</span>
      </label>
      <Button
        label="确认选择"
        size="small"
        :disabled="!selectedNovel.id || busy"
        :loading="busy"
        @click="store.chooseNovel(selectedNovel.id)"
      />
    </template>

    <template v-else>
      <div v-for="(item, index) in question.items ?? []" :key="index" class="iqc-item">
        <p class="iqc-text">{{ item.question }}</p>
        <div v-if="item.suggestedAnswers.length" class="iqc-choices">
          <button
            v-for="(label, choice) in item.suggestedAnswers"
            :key="choice"
            type="button"
            class="iqc-choice"
            :class="{ 'iqc-choice--active': answers[index]?.selectedIndex === choice }"
            @click="pick(index, choice, label)"
          >
            {{ label }}
          </button>
        </div>
        <InputText
          v-if="item.allowFreeText"
          :model-value="answers[index]?.selectedIndex === undefined ? answers[index]?.text : ''"
          :placeholder="item.placeholder ?? '或输入你的回答'"
          :maxlength="item.maxLength"
          class="iqc-input"
          @update:model-value="(value?: string) => typed(index, value ?? '')"
        />
      </div>
      <Button
        label="提交回答"
        size="small"
        :disabled="!complete || busy"
        :loading="busy"
        @click="submit"
      />
    </template>
  </div>
</template>

<style scoped>
.iqc {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  margin: 0.5rem 0.75rem;
  border-radius: 14px;
  background: rgba(20, 184, 166, 0.08);
  border: 1px solid rgba(45, 212, 191, 0.3);
}

.iqc-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgb(153, 246, 228);
}

.iqc-text {
  font-size: 0.82rem;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.iqc-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.iqc-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.iqc-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.iqc-choice {
  font-size: 0.78rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.iqc-choice--active {
  border-color: rgb(45, 212, 191);
  background: rgba(45, 212, 191, 0.18);
}

.iqc-input {
  width: 100%;
}
</style>
