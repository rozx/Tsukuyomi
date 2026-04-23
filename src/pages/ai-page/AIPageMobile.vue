<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();

// v-model 绑到 routingPickerTask 是否有值（true = 打开）。关闭时清空任务 key
// 以保持 useAIPage 的既有逻辑一致。
const routingPickerVisible = computed({
  get: () => !!ctx.routingPickerTask.value,
  set: (open) => {
    if (!open) ctx.closeTaskRoutingPicker();
  },
});
</script>

<template>
  <div class="mobile-ai w-full h-full flex flex-col">
    <header class="ma-largetitle">
      <div class="ma-eyebrow">AI MODELS</div>
      <h1 class="ma-title">AI 模型</h1>
    </header>

    <div class="ma-byok">
      <i class="pi pi-shield" aria-hidden="true" />
      <span>BYOK · 密钥仅存储在本设备。</span>
    </div>

    <div v-if="ctx.isPageLoading.value" class="ma-state">
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载 AI 模型…</span>
    </div>

    <div v-else-if="ctx.aiModels.value.length === 0" class="ma-state">
      <i class="pi pi-sparkles ma-state-icon" aria-hidden="true" />
      <span class="ma-state-title">暂无配置的 AI 模型</span>
      <Button
        label="添加第一个 AI 模型"
        icon="pi pi-plus"
        class="p-button-primary"
        @click="ctx.addModel"
      />
    </div>

    <div v-else class="ma-scroll">
      <section class="ma-section">
        <div class="ma-section-head">
          <span class="ma-section-title">提供商</span>
          <button class="ma-add-btn" @click="ctx.addModel">
            <i class="pi pi-plus" aria-hidden="true" /> 添加
          </button>
        </div>
        <div class="ma-providers">
          <div
            v-for="group in ctx.providerGroups.value"
            :key="group.provider"
            class="ma-provider-card"
          >
            <div class="ma-provider-head">
              <div
                class="ma-provider-avatar"
                :style="{
                  background: `${group.color}22`,
                  color: group.color,
                  borderColor: `${group.color}55`,
                }"
              >
                {{ group.letter }}
              </div>
              <div class="ma-provider-body">
                <div class="ma-provider-name">{{ group.label }}</div>
                <div class="ma-provider-sub">
                  {{ group.models.length }} 个模型 · 已启用 {{ group.enabledCount }}
                </div>
              </div>
            </div>
            <div class="ma-provider-models">
              <div
                v-for="model in group.models"
                :key="model.id"
                class="ma-model-row"
                role="button"
                @click="ctx.editModel(model)"
              >
                <div class="ma-model-main">
                  <div class="ma-model-name">{{ model.name }}</div>
                  <div class="ma-model-meta">{{ model.model }}</div>
                </div>
                <span class="ma-badge" :class="model.enabled ? 'ma-badge--on' : 'ma-badge--off'">
                  {{ model.enabled ? '已启用' : '已禁用' }}
                </span>
                <i class="pi pi-chevron-right ma-chev" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="ma-section ma-section--last">
        <div class="ma-section-head">
          <span class="ma-section-title">任务路由</span>
        </div>
        <div class="ma-routing-card">
          <button
            v-for="(row, idx) in ctx.taskRouting.value"
            :key="row.task"
            type="button"
            class="ma-routing-row"
            :class="{ 'ma-routing-row--last': idx === ctx.taskRouting.value.length - 1 }"
            :aria-label="`编辑 ${row.label} 的默认模型`"
            @click="ctx.openTaskRoutingPicker(row.task)"
          >
            <span class="ma-routing-label">{{ row.label }}</span>
            <span
              class="ma-routing-value"
              :class="{ 'ma-routing-value--unset': !row.modelId }"
            >
              <i class="pi pi-sparkles" aria-hidden="true" /> {{ row.value }}
            </span>
            <i class="pi pi-chevron-right ma-routing-chev" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>

    <!-- 任务路由 picker —— 统一使用 MobileBottomSheet -->
    <MobileBottomSheet
      v-model:visible="routingPickerVisible"
      :title="ctx.routingPickerTaskLabel.value || '任务路由'"
      eyebrow="任务路由"
    >
      <!-- 未设置 -->
      <button
        type="button"
        class="ma-picker-option"
        :class="{ 'ma-picker-option--active': !ctx.routingPickerCurrentModelId.value }"
        @click="ctx.pickModelForTask(null)"
      >
        <div class="ma-picker-option-main">
          <div class="ma-picker-option-name">未设置</div>
          <div class="ma-picker-option-meta">该任务将无默认模型</div>
        </div>
        <i
          v-if="!ctx.routingPickerCurrentModelId.value"
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
        :class="{
          'ma-picker-option--active': model.id === ctx.routingPickerCurrentModelId.value,
        }"
        @click="ctx.pickModelForTask(model.id)"
      >
        <div class="ma-picker-option-main">
          <div class="ma-picker-option-name">{{ model.name }}</div>
          <div class="ma-picker-option-meta">
            {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
          </div>
        </div>
        <i
          v-if="model.id === ctx.routingPickerCurrentModelId.value"
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
  </div>
</template>

<style scoped>
.mobile-ai {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.ma-largetitle {
  padding: 16px 20px 6px;
  flex-shrink: 0;
}

.ma-eyebrow {
  font-weight: 500;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.ma-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.02em;
  margin: 0;
}

.ma-byok {
  margin: 10px 20px 0;
  padding: 10px 12px;
  background: var(--tsukuyomi-opacity-8); /* token: tsukuyomi-500 @ 8% */
  border: 1px solid var(--tsukuyomi-opacity-25);
  border-radius: 10px;
  font-size: 12px;
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ma-byok i {
  font-size: 13px;
}

.ma-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ma-scroll::-webkit-scrollbar {
  width: 0;
}

.ma-section {
  padding: 16px 20px 0;
}

.ma-section--last {
  padding-bottom: 24px;
}

.ma-section-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.ma-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.ma-add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  background: var(--tsukuyomi-opacity-12);
  border: 1px solid var(--tsukuyomi-opacity-30);
  border-radius: 7px;
  cursor: pointer;
}

.ma-add-btn i {
  font-size: 10px;
}

.ma-providers {
  display: grid;
  gap: 12px;
}

.ma-provider-card {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  overflow: hidden;
}

.ma-provider-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.ma-provider-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 700;
  font-size: 16px;
  border: 1px solid;
  flex-shrink: 0;
}

.ma-provider-body {
  flex: 1;
  min-width: 0;
}

.ma-provider-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.ma-provider-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
}

.ma-provider-models {
  display: flex;
  flex-direction: column;
}

.ma-model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--white-opacity-4);
  cursor: pointer;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ma-model-row:last-child {
  border-bottom: none;
}

.ma-model-row:active {
  background: var(--white-opacity-3);
}

.ma-model-main {
  flex: 1;
  min-width: 0;
}

.ma-model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--moon-50-opacity-90);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-model-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  border: 1px solid;
  white-space: nowrap;
}

.ma-badge--on {
  background: var(--color-success-opacity-12); /* token: success-500 @ 12% */
  color: var(--color-success-300); /* token: success-300 */
  border-color: var(--color-success-opacity-30); /* token: success-500 @ 30% */
}

.ma-badge--off {
  background: var(--white-opacity-4);
  color: var(--moon-50-opacity-55);
  border-color: var(--white-opacity-10);
}

.ma-chev {
  color: var(--moon-50-opacity-35); /* token: moon-50 @ 35% */
  font-size: 11px;
}

.ma-routing-card {
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  padding: 4px 14px;
}

.ma-routing-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--white-opacity-6);
  text-align: left;
  cursor: pointer;
  color: inherit;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
}

.ma-routing-row:active {
  background: var(--white-opacity-3);
}

.ma-routing-row--last {
  border-bottom: none;
}

.ma-routing-label {
  font-size: 12px;
  color: var(--moon-50-opacity-85);
  flex: 1;
}

.ma-routing-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  background: var(--tsukuyomi-opacity-15);
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
  border: 1px solid var(--tsukuyomi-opacity-30);
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-routing-value--unset {
  background: var(--white-opacity-4);
  color: var(--moon-50-opacity-55);
  border-color: var(--white-opacity-10);
}

.ma-routing-value i {
  font-size: 9px;
  opacity: 0.85;
  flex-shrink: 0;
}

.ma-routing-chev {
  color: var(--moon-50-opacity-35); /* token: moon-50 @ 35% */
  font-size: 10px;
  flex-shrink: 0;
}

/* ───── 任务路由 Picker 选项样式（sheet 外壳由 MobileBottomSheet 提供） ───── */
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

.ma-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  text-align: center;
  color: var(--moon-50-opacity-60);
  font-size: 13px;
}

.ma-state-icon {
  font-size: 42px;
  color: var(--moon-50-opacity-25); /* token: moon-50 @ 25% */
}

.ma-state-title {
  font-size: 14px;
  color: var(--moon-50-opacity-70);
}
</style>
