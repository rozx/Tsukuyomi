<script setup lang="ts">
/**
 * 任务路由 picker（手机端底部抽屉）。从 AIPageMobile 抽出以降低其模板圈复杂度。
 * 自行注入 useAIPage 上下文，无需父级 prop 传递。
 */
import { computed } from 'vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();

const routingPickerVisible = computed({
  get: () => !!ctx.routingPickerTask.value,
  set: (open: boolean) => {
    if (!open) ctx.closeTaskRoutingPicker();
  },
});
const routingPickerTitle = computed(() => ctx.routingPickerTaskLabel.value || '任务路由');
const hasNoPickerModel = computed(() => !ctx.routingPickerCurrentModelId.value);
const isPickerActive = (model: { id: string }) =>
  model.id === ctx.routingPickerCurrentModelId.value;
</script>

<template>
  <MobileBottomSheet
    v-model:visible="routingPickerVisible"
    :title="routingPickerTitle"
    eyebrow="任务路由"
  >
    <!-- 未设置 -->
    <button
      type="button"
      class="ma-picker-option"
      :class="{ 'ma-picker-option--active': hasNoPickerModel }"
      @click="ctx.pickModelForTask(null)"
    >
      <div class="ma-picker-option-main">
        <div class="ma-picker-option-name">未设置</div>
        <div class="ma-picker-option-meta">该任务将无默认模型</div>
      </div>
      <i
        v-if="hasNoPickerModel"
        class="pi pi-check ma-picker-option-check"
        aria-hidden="true"
      />
    </button>

    <!-- 可选模型 -->
    <button
      v-for="model in ctx.routingPickerOptions.value"
      :key="model.id"
      type="button"
      class="ma-picker-option"
      :class="{ 'ma-picker-option--active': isPickerActive(model) }"
      @click="ctx.pickModelForTask(model.id)"
    >
      <div class="ma-picker-option-main">
        <div class="ma-picker-option-name">{{ model.name }}</div>
        <div class="ma-picker-option-meta">
          {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
        </div>
      </div>
      <i
        v-if="isPickerActive(model)"
        class="pi pi-check ma-picker-option-check"
        aria-hidden="true"
      />
    </button>

    <!-- 空状态 -->
    <div v-if="ctx.routingPickerOptions.value.length === 0" class="ma-picker-empty">
      <i class="pi pi-info-circle" aria-hidden="true" />
      <span>暂无支持此任务的模型，请在模型编辑页面中启用该任务。</span>
    </div>
  </MobileBottomSheet>
</template>

<style scoped>
.ma-picker-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
  margin-bottom: 2px;
}

.ma-picker-option:active {
  background: var(--white-opacity-4);
}

.ma-picker-option--active {
  background: var(--tsukuyomi-opacity-12);
  border-color: var(--tsukuyomi-opacity-30);
}

.ma-picker-option-main {
  flex: 1;
  min-width: 0;
}

.ma-picker-option-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-200); /* token: primary */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-picker-option-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-picker-option-check {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-size: 13px;
  flex-shrink: 0;
}

.ma-picker-empty {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px;
  margin: 8px 0 4px;
  background: var(--tsukuyomi-opacity-6); /* token: tsukuyomi-500 @ 6% */
  border: 1px solid var(--tsukuyomi-opacity-18);
  border-radius: 10px;
  font-size: 12px;
  color: var(--moon-50-opacity-75);
  line-height: 1.5;
}

.ma-picker-empty i {
  font-size: 14px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  margin-top: 1px;
  flex-shrink: 0;
}
</style>
