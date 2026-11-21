<script setup lang="ts">
/**
 * 设置字段：标签 + 控件（默认插槽）+ 说明（hint 文本或 #hint 插槽，用于状态行等富内容）。
 * 传入 hintId 时说明段落带上该 id，供控件 aria-describedby 关联；#label-aside 插槽显示在标签右侧（如滑块当前值）。
 */
interface Props {
  label?: string;
  /** 控件的 input id，用于 label 的 for 关联 */
  inputId?: string;
  hint?: string | undefined;
  hintId?: string;
}

defineProps<Props>();
</script>

<template>
  <div class="settings-field">
    <div v-if="label" class="settings-field-label-row">
      <label class="settings-field-label" :for="inputId">{{ label }}</label>
      <span v-if="$slots['label-aside']" class="settings-field-label-aside">
        <slot name="label-aside" />
      </span>
    </div>
    <slot />
    <div v-if="hint || $slots.hint" :id="hintId" class="settings-field-hint">
      <slot name="hint">{{ hint }}</slot>
    </div>
  </div>
</template>

<style scoped>
.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.settings-field-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.settings-field-label-aside {
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  color: var(--moon-50-opacity-62);
}

.settings-field-label {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--moon-50-opacity-85);
}

.settings-field-hint {
  font-size: 0.76rem;
  line-height: 1.55;
  color: var(--moon-50-opacity-58);
}
</style>
