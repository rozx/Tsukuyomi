<script setup lang="ts">
/**
 * 任务路由 picker（平板端 Dialog）。从 AIPageTablet 抽出以降低其模板圈复杂度。
 * 自行注入 useAIPage 上下文。
 */
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();

const routingPickerVisible = computed({
  get: () => !!ctx.routingPickerTask.value,
  set: (value: boolean) => {
    if (!value) ctx.closeTaskRoutingPicker();
  },
});
const routingPickerTitle = computed(() => ctx.routingPickerTaskLabel.value || '任务路由');
const hasNoPickerModel = computed(() => !ctx.routingPickerCurrentModelId.value);
const isPickerModelActive = (model: { id: string }) =>
  model.id === ctx.routingPickerCurrentModelId.value;
</script>

<template>
  <Dialog
    v-model:visible="routingPickerVisible"
    :header="routingPickerTitle"
    modal
    :style="{ width: '480px', maxWidth: '92vw' }"
    :dismissable-mask="true"
  >
    <div class="ait-picker">
      <button
        type="button"
        class="ait-picker-option"
        :class="{ 'ait-picker-option-active': hasNoPickerModel }"
        @click="ctx.pickModelForTask(null)"
      >
        <div class="ait-picker-option-body">
          <div class="ait-picker-option-name">未设置</div>
          <div class="ait-picker-option-sub">该任务将无默认模型</div>
        </div>
        <i
          v-if="hasNoPickerModel"
          class="pi pi-check ait-picker-check"
          aria-hidden="true"
        />
      </button>
      <button
        v-for="model in ctx.routingPickerOptions.value"
        :key="model.id"
        type="button"
        class="ait-picker-option"
        :class="{ 'ait-picker-option-active': isPickerModelActive(model) }"
        @click="ctx.pickModelForTask(model.id)"
      >
        <div class="ait-picker-option-body">
          <div class="ait-picker-option-name">{{ model.name }}</div>
          <div class="ait-picker-option-sub">
            {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
          </div>
        </div>
        <i
          v-if="isPickerModelActive(model)"
          class="pi pi-check ait-picker-check"
          aria-hidden="true"
        />
      </button>
    </div>
  </Dialog>
</template>

<style scoped>
.ait-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
  max-height: 60vh;
  overflow-y: auto;
}

.ait-picker-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--white-opacity-2); /* token: white @ 2% */
  border: 1px solid var(--white-opacity-8);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ait-picker-option:hover {
  background: var(--white-opacity-5);
  border-color: var(--white-opacity-12);
}

.ait-picker-option-active {
  background: var(--tsukuyomi-opacity-12);
  border-color: var(--tsukuyomi-opacity-30);
}

.ait-picker-option-body {
  flex: 1;
  min-width: 0;
}

.ait-picker-option-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.ait-picker-option-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
}

.ait-picker-check {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-size: 14px;
}
</style>
