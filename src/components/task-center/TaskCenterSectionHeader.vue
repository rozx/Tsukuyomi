<script setup lang="ts">
/**
 * 任务中心分区标题栏：吸顶色带 + 状态色点 + 数量徽标 + 右侧操作（默认插槽，按钮用 class tc-sh-action）。
 * 进行中 / 排队中 / 已完成 / 后台向量化 / 其他 AI 活动共用，保证各分区外观一致、分隔清晰。
 */
const props = defineProps<{
  label: string;
  count: number;
  tone: 'running' | 'queued' | 'finished' | 'background' | 'other';
  /** 可折叠时标签变为按钮 */
  collapsible?: boolean;
  collapsed?: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();

const onLabelClick = () => {
  if (props.collapsible) emit('toggle');
};
</script>

<template>
  <div class="tc-sh" :class="`tc-sh--${tone}`">
    <component
      :is="collapsible ? 'button' : 'div'"
      class="tc-sh-label"
      :class="{ 'tc-sh-label--toggle': collapsible }"
      v-bind="collapsible ? { type: 'button', 'aria-expanded': !collapsed } : {}"
      @click="onLabelClick"
    >
      <i
        v-if="collapsible"
        class="pi tc-sh-chevron"
        :class="collapsed ? 'pi-chevron-right' : 'pi-chevron-down'"
        aria-hidden="true"
      />
      <span class="tc-sh-dot" aria-hidden="true" />
      <span>{{ label }}</span>
      <span class="tc-sh-count">{{ count }}</span>
    </component>
    <div class="tc-sh-actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tc-sh {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  /* 不透明底色：吸顶时遮住滚动中的行（固定面板外壳是半透明的） */
  background: #252932;
  border-top: 1px solid var(--white-opacity-8);
  border-bottom: 1px solid var(--white-opacity-8);
}

.tc-sh-label {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--moon-opacity-80);
  text-align: left;
}

.tc-sh-label--toggle {
  cursor: pointer;
}

.tc-sh-label--toggle:hover {
  color: var(--moon-opacity-90);
}

.tc-sh-chevron {
  font-size: 10px;
  color: var(--moon-opacity-50);
}

.tc-sh-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
}

.tc-sh--running .tc-sh-dot {
  background: #a3b7cf;
  box-shadow: 0 0 0 3px rgba(163, 183, 207, 0.18);
}

.tc-sh--queued .tc-sh-dot {
  background: #e7c98a;
}

.tc-sh--finished .tc-sh-dot {
  background: #7fc29b;
}

.tc-sh--background .tc-sh-dot {
  background: #8fb8c9;
}

.tc-sh--other .tc-sh-dot {
  background: #b9a6d9;
}

.tc-sh-count {
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--white-opacity-8);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  text-align: center;
  color: var(--moon-opacity-80);
  font-variant-numeric: tabular-nums;
}

.tc-sh-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.tc-sh-actions :slotted(.tc-sh-action) {
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 11px;
  color: var(--btn-text-color);
  cursor: pointer;
}

.tc-sh-actions :slotted(.tc-sh-action:hover) {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}
</style>
