<script setup lang="ts">
/** 月詠提问中的一题：候选答案可一键选择；允许时也可以输入自己的回答。 */
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import type { ImportQuestionItem } from 'src/models/import';
import type { ImportAskValue } from './import-ask';

const props = defineProps<{ item: ImportQuestionItem; modelValue: ImportAskValue }>();
const emit = defineEmits<{ 'update:modelValue': [value: ImportAskValue] }>();

const typedText = computed(() =>
  props.modelValue.selectedIndex === undefined ? props.modelValue.text : '',
);
const placeholder = computed(() => props.item.placeholder ?? '或输入你的回答');
const isChosen = (choice: number) => props.modelValue.selectedIndex === choice;
const pick = (choice: number, label: string) =>
  emit('update:modelValue', { text: label, selectedIndex: choice });
const type = (value?: string) => emit('update:modelValue', { text: value ?? '' });
</script>

<template>
  <div class="iai">
    <p class="iai-text">{{ item.question }}</p>
    <div v-if="item.suggestedAnswers.length" class="iai-choices">
      <button
        v-for="(label, choice) in item.suggestedAnswers"
        :key="choice"
        type="button"
        class="iai-choice"
        :class="{ 'iai-choice--active': isChosen(choice) }"
        @click="pick(choice, label)"
      >
        {{ label }}
      </button>
    </div>
    <InputText
      v-if="item.allowFreeText"
      :model-value="typedText"
      :placeholder="placeholder"
      :maxlength="item.maxLength"
      class="iai-input"
      @update:model-value="type"
    />
  </div>
</template>

<style scoped>
.iai {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.iai-text {
  font-size: 0.82rem;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.iai-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.iai-choice {
  font-size: 0.78rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.iai-choice--active {
  border-color: rgb(45, 212, 191);
  background: rgba(45, 212, 191, 0.18);
}

.iai-input {
  width: 100%;
}
</style>
