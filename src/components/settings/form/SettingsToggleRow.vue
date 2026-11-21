<script setup lang="ts">
/**
 * 开关行：左侧标签 + 说明，右侧 ToggleSwitch。设置页所有布尔设置统一用它（不再混用复选框）。
 * 禁用时文字一起变淡；说明可用 #hint 插槽放图标或警告文案。
 */
import { useId } from 'vue';
import ToggleSwitch from 'primevue/toggleswitch';

interface Props {
  label: string;
  modelValue: boolean;
  hint?: string | undefined;
  disabled?: boolean;
  /** 不传时自动生成，保证 label 与开关关联 */
  inputId?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const fallbackId = useId();
const hintId = useId();
</script>

<template>
  <div class="settings-toggle-row" :class="{ 'settings-toggle-row--disabled': disabled }">
    <div class="settings-toggle-text">
      <label class="settings-toggle-label" :for="props.inputId ?? fallbackId">{{ label }}</label>
      <div v-if="hint || $slots.hint" :id="hintId" class="settings-toggle-hint">
        <slot name="hint">{{ hint }}</slot>
      </div>
    </div>
    <ToggleSwitch
      class="settings-toggle-switch"
      :input-id="props.inputId ?? fallbackId"
      :model-value="modelValue"
      :disabled="disabled"
      :aria-describedby="hint || $slots.hint ? hintId : undefined"
      @update:model-value="(value: boolean) => emit('update:modelValue', value)"
    />
  </div>
</template>

<style scoped>
.settings-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
}

.settings-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
  min-width: 0;
}

.settings-toggle-label {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--moon-50-opacity-85);
  cursor: pointer;
}

.settings-toggle-hint {
  font-size: 0.76rem;
  line-height: 1.55;
  color: var(--moon-50-opacity-58);
}

.settings-toggle-switch {
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.settings-toggle-row--disabled .settings-toggle-label {
  color: var(--moon-50-opacity-50);
  cursor: default;
}

.settings-toggle-row--disabled .settings-toggle-hint {
  color: var(--moon-50-opacity-45);
}
</style>
