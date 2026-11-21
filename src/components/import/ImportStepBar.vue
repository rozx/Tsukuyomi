<script setup lang="ts">
/**
 * 导入三步进度（来源 → 整理 → 导入），三端共用：
 * 完成的一步显示绿色勾，当前该做的一步是薄藍圈，正在查看的一步是薄藍淡底；每一步都可点选查看。
 */
import { useI18n } from 'vue-i18n';
import { useImportFlow } from 'src/composables/import-page/useImportFlow';

const { t } = useI18n();
const { steps, selectStep } = useImportFlow();
</script>

<template>
  <ol class="isb" :aria-label="t('importUi.flow.steps')">
    <li v-for="step in steps" :key="step.id" class="isb-item">
      <button
        type="button"
        class="isb-step"
        :class="{
          'isb-step--done': step.done,
          'isb-step--active': step.active,
          'isb-step--viewing': step.viewing,
        }"
        :aria-current="step.viewing ? 'step' : undefined"
        @click="selectStep(step.id)"
      >
        <span class="isb-mark">
          <i v-if="step.done" class="pi pi-check" aria-hidden="true" />
          <template v-else>{{ step.index }}</template>
        </span>
        <span class="isb-text">
          <span class="isb-label">{{ step.label }}</span>
          <span v-if="step.meta" class="isb-meta">{{ step.meta }}</span>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.isb {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.isb-item {
  min-width: 0;
}

.isb-step {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--moon-50-opacity-60);
  text-align: left;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.isb-step:hover {
  border-color: var(--white-opacity-12, rgba(255, 255, 255, 0.12));
}

.isb-mark {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--white-opacity-12, rgba(255, 255, 255, 0.12));
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.isb-mark .pi {
  font-size: 10px;
}

.isb-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.isb-label {
  font-size: 13px;
  font-weight: 600;
}

.isb-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--moon-50-opacity-50);
}

/* 已完成：绿色勾 */
.isb-step--done .isb-mark {
  border-color: rgba(127, 194, 155, 0.5);
  background: rgba(127, 194, 155, 0.14);
  color: #9fd3b4;
}

/* 当前该做的一步：薄藍圈 */
.isb-step--active .isb-mark {
  border-color: var(--tsukuyomi-300);
  color: var(--tsukuyomi-100);
}

.isb-step--active {
  color: var(--moon-50-opacity-85);
}

/* 正在查看的一步：薄藍淡底 */
.isb-step--viewing {
  border-color: var(--btn-primary-border);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
}
</style>
