<script setup lang="ts">
/** 多小说选择：必须由用户实际选中一个候选，取消或关闭不解除等待。 */
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import RadioButton from 'primevue/radiobutton';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportPendingQuestion } from 'src/models/import';

const props = defineProps<{ question: ImportPendingQuestion }>();
const store = useImportWorkspaceStore();

const selected = ref('');
watch(
  () => props.question.id,
  () => {
    selected.value = '';
  },
);
const busy = computed(() => store.pendingAction === 'choose-novel');
const confirmDisabled = computed(() => !selected.value || busy.value);
const confirm = () => void store.chooseNovel(selected.value);
</script>

<template>
  <p class="inc-text">{{ question.question }}</p>
  <label v-for="option in question.options" :key="option.id" class="inc-option">
    <RadioButton v-model="selected" :value="option.id" name="import-novel" />
    <span>{{ option.label }}</span>
  </label>
  <Button
    label="确认选择"
    size="small"
    :disabled="confirmDisabled"
    :loading="busy"
    @click="confirm"
  />
</template>

<style scoped>
.inc-text {
  font-size: 0.82rem;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.inc-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  cursor: pointer;
}
</style>
