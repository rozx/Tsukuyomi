<script setup lang="ts">
/**
 * 导入任务的必要问题：多小说选择或月詠的提问。回答绑定当前任务与问题；
 * 关闭或忽略不会解除等待，部分回答也不会被接受。
 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import ImportNovelChoice from './ImportNovelChoice.vue';
import ImportAskItem from './ImportAskItem.vue';
import type { ImportAskValue } from './import-ask';

const store = useImportWorkspaceStore();
const question = computed(() => store.task?.pendingQuestion);
const visible = computed(() => Boolean(question.value && !question.value.answer));
const isNovel = computed(() => question.value?.kind === 'novel');
const title = computed(() => (isNovel.value ? '请选择本次导入的小说' : '月詠在等你回答'));
const items = computed(() => question.value?.items ?? []);

const answers = ref<ImportAskValue[]>([]);
watch(
  () => question.value?.id,
  () => {
    answers.value = items.value.map(() => ({ text: '' }));
  },
  { immediate: true },
);

const busy = computed(() => store.pendingAction === 'answer');
const complete = computed(() => answers.value.every((entry) => entry.text.trim()));
const submitDisabled = computed(() => !complete.value || busy.value);

const submit = () =>
  void store.answerQuestion(
    answers.value.map((entry, index) => ({
      questionIndex: index,
      answer: entry.text.trim(),
      ...(entry.selectedIndex !== undefined ? { selectedIndex: entry.selectedIndex } : {}),
    })),
  );
</script>

<template>
  <div v-if="visible && question" class="iqc" role="group" aria-label="待回答的问题">
    <div class="iqc-head">
      <i class="pi pi-question-circle" aria-hidden="true" />
      <span>{{ title }}</span>
    </div>
    <ImportNovelChoice v-if="isNovel" :question="question" />
    <template v-else>
      <ImportAskItem
        v-for="(item, index) in items"
        :key="index"
        v-model="answers[index]!"
        :item="item"
      />
      <Button
        label="提交回答"
        size="small"
        :disabled="submitDisabled"
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
</style>
