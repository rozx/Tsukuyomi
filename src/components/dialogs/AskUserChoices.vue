<template>
  <div v-if="suggestedAnswers.length > 0" class="suggested">
    <div class="label">推荐答案</div>
    <div class="buttons">
      <Button
        v-for="(ans, idx) in suggestedAnswers"
        :key="`${idx}-${ans}`"
        class="p-button-outlined choice-button"
        :class="{ selected: selectedIndex === idx }"
        @click="emit('select', idx, ans)"
      >
        {{ formatChoiceLabel(idx, ans) }}
      </Button>
      <Button
        v-if="allowFreeText"
        class="p-button-outlined choice-button"
        severity="secondary"
        @click="emit('other')"
      >
        {{ otherLabel }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';

defineProps<{
  suggestedAnswers: string[];
  selectedIndex: number | null;
  allowFreeText: boolean;
  otherLabel: string;
}>();

const emit = defineEmits<{
  select: [index: number, answer: string];
  other: [];
}>();

// 选项字母编号（A、B、…、Z，超出则用 #N）
const choiceLetter = (index: number): string => {
  if (!Number.isFinite(index) || index < 0) return '#';
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < base.length) return base[index] ?? '#';
  return `#${index + 1}`;
};

const formatChoiceLabel = (index: number, answer: string): string =>
  `${choiceLetter(index)}: ${answer}`;
</script>

<style scoped>
.label {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 6px;
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
</style>
