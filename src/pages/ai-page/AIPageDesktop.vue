<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Dialog from 'primevue/dialog';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ProgressSpinner from 'primevue/progressspinner';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();

const routingPickerVisible = computed({
  get: () => !!ctx.routingPickerTask.value,
  set: (open: boolean) => {
    if (!open) ctx.closeTaskRoutingPicker();
  },
});

const enabledCount = computed(() => ctx.aiModels.value.filter((model) => model.enabled).length);
const configuredRoutes = computed(() => ctx.taskRouting.value.filter((row) => row.modelId).length);
const filteredProviderGroups = computed(() =>
  ctx.providerGroups.value
    .map((group) => ({
      ...group,
      models: group.models.filter((model) =>
        ctx.filteredModels.value.some((item) => item.id === model.id),
      ),
    }))
    .filter((group) => group.models.length > 0),
);
const pageSummary = computed(() => {
  if (ctx.searchQuery.value) {
    return `当前筛出 ${ctx.filteredModels.value.length} 个模型，仍可继续编辑、复制或调整任务路由。`;
  }
  return '在桌面工具页里统一维护模型清单、默认任务和任务路由。';
});
</script>

<template>
  <div class="desktop-ai-page">
    <DesktopWorkbenchHeader eyebrow="AI Models" title="AI 模型工作台" :description="pageSummary">
      <template #actions>
        <div class="ai-header-actions">
          <InputGroup class="ai-search-group">
            <InputGroupAddon>
              <i class="pi pi-search text-base" />
            </InputGroupAddon>
            <InputText
              v-model="ctx.searchQuery.value"
              placeholder="搜索模型名称、提供商、模型类型或默认任务..."
            />
            <InputGroupAddon v-if="ctx.searchQuery.value">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm"
                title="清除搜索"
                @click="ctx.searchQuery.value = ''"
              />
            </InputGroupAddon>
          </InputGroup>
          <Button
            label="添加 AI 模型"
            icon="pi pi-plus"
            class="p-button-primary flex-shrink-0"
            @click="ctx.addModel"
          />
        </div>
      </template>

      <template #metrics>
        <div class="ai-metrics-grid">
          <div class="ai-metric-card">
            <div class="ai-metric-label">模型总数</div>
            <div class="ai-metric-value">{{ ctx.aiModels.value.length }}</div>
          </div>
          <div class="ai-metric-card">
            <div class="ai-metric-label">已启用</div>
            <div class="ai-metric-value">{{ enabledCount }}</div>
          </div>
          <div class="ai-metric-card">
            <div class="ai-metric-label">任务路由</div>
            <div class="ai-metric-value">
              {{ configuredRoutes }}/{{ ctx.taskRouting.value.length }}
            </div>
          </div>
        </div>
      </template>
    </DesktopWorkbenchHeader>

    <div v-if="ctx.isPageLoading.value" class="ai-loading-shell">
      <DesktopWorkbenchSurface class="ai-loading-surface" tone="muted">
        <div class="ai-loading-state">
          <ProgressSpinner
            style="width: 46px; height: 46px"
            stroke-width="4"
            animation-duration=".8s"
            aria-label="加载中"
          />
          <p class="text-moon/70 mt-4">正在加载 AI 模型...</p>
        </div>
      </DesktopWorkbenchSurface>
    </div>

    <div v-else class="ai-workbench-grid">
      <DesktopWorkbenchSurface class="ai-models-surface" :padded="false">
        <div class="ai-surface-banner">
          <i class="pi pi-shield" aria-hidden="true" />
          <span>BYOK · 密钥仅存储在本设备 · IndexedDB 本地保存</span>
        </div>

        <DataView
          :value="filteredProviderGroups"
          data-key="provider"
          :rows="10"
          :paginator="filteredProviderGroups.length > 0"
          :rows-per-page-options="[5, 10, 20]"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
          class="ai-data-view"
        >
          <template #empty>
            <div class="ai-empty-state">
              <i class="pi pi-sparkles text-4xl text-moon/50 mb-4" />
              <p class="text-moon/70">
                {{ ctx.searchQuery.value ? '未找到匹配的 AI 模型' : '暂无配置的 AI 模型' }}
              </p>
              <Button
                v-if="!ctx.searchQuery.value"
                label="添加第一个 AI 模型"
                icon="pi pi-plus"
                class="p-button-primary mt-4"
                @click="ctx.addModel"
              />
            </div>
          </template>

          <template #list="slotProps">
            <div class="ai-group-list">
              <section
                v-for="group in slotProps.items"
                :key="group.provider"
                class="ai-provider-group"
              >
                <header class="ai-provider-head">
                  <div
                    class="ai-provider-badge"
                    :style="{
                      background: `${group.color}22`,
                      color: group.color,
                      borderColor: `${group.color}44`,
                    }"
                  >
                    {{ group.letter }}
                  </div>
                  <div class="ai-provider-copy">
                    <h2 class="ai-provider-title">{{ group.label }}</h2>
                    <p class="ai-provider-summary">
                      {{ group.models.length }} 个模型 · 已启用 {{ group.enabledCount }} 个
                    </p>
                  </div>
                </header>

                <div class="ai-model-list">
                  <article v-for="model in group.models" :key="model.id" class="ai-model-card">
                    <div class="ai-model-card-head">
                      <div class="ai-model-copy">
                        <div class="ai-model-name-row">
                          <h3 class="ai-model-name">{{ model.name }}</h3>
                          <Tag
                            :value="model.enabled ? '已启用' : '已禁用'"
                            :severity="model.enabled ? 'success' : 'secondary'"
                          />
                        </div>
                        <p class="ai-model-subtitle">
                          {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
                        </p>
                      </div>
                      <div class="ai-model-actions">
                        <Button
                          icon="pi pi-copy"
                          class="p-button-text p-button-sm"
                          title="复制"
                          @click="ctx.duplicateModel(model)"
                        />
                        <Button
                          icon="pi pi-pencil"
                          class="p-button-text p-button-sm"
                          title="编辑"
                          @click="ctx.editModel(model)"
                        />
                        <Button
                          icon="pi pi-trash"
                          class="p-button-text p-button-sm p-button-danger"
                          title="删除"
                          @click="ctx.deleteModel(model)"
                        />
                      </div>
                    </div>

                    <div class="ai-model-meta-grid">
                      <div class="ai-model-meta-item">
                        <span>温度</span>
                        <strong>{{ model.temperature }}</strong>
                      </div>
                      <div class="ai-model-meta-item">
                        <span>上下文窗口</span>
                        <strong>{{ model.maxInputTokens }}</strong>
                      </div>
                      <div class="ai-model-meta-item">
                        <span>最大输出</span>
                        <strong>{{ model.maxOutputTokens }}</strong>
                      </div>
                      <div class="ai-model-meta-item">
                        <span>API Key</span>
                        <strong class="ai-model-mono">{{ ctx.formatApiKey(model.apiKey) }}</strong>
                      </div>
                      <div class="ai-model-meta-item ai-model-meta-item--full">
                        <span>基础地址</span>
                        <strong class="ai-model-mono">{{ model.baseUrl }}</strong>
                      </div>
                      <div class="ai-model-meta-item ai-model-meta-item--full">
                        <span>默认任务</span>
                        <strong>{{ ctx.getDefaultTasks(model) }}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </template>
        </DataView>
      </DesktopWorkbenchSurface>

      <DesktopWorkbenchSurface class="ai-routing-surface" tone="muted">
        <header class="ai-routing-head">
          <div class="ai-routing-eyebrow">Task Routing</div>
          <h2 class="ai-routing-title">任务路由</h2>
          <p class="ai-routing-description">为不同任务选择默认模型，设置会随导入导出一起保存。</p>
        </header>

        <div class="ai-routing-list">
          <button
            v-for="row in ctx.taskRouting.value"
            :key="row.task"
            class="ai-routing-row"
            :class="{ 'ai-routing-row--empty': !row.modelId }"
            @click="ctx.openTaskRoutingPicker(row.task)"
          >
            <div class="ai-routing-row-copy">
              <span class="ai-routing-row-label">{{ row.label }}</span>
              <span class="ai-routing-row-value">{{ row.value }}</span>
            </div>
            <i class="pi pi-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </DesktopWorkbenchSurface>
    </div>

    <Dialog
      v-model:visible="routingPickerVisible"
      :header="ctx.routingPickerTaskLabel.value || '任务路由'"
      modal
      :style="{ width: '480px', maxWidth: '92vw' }"
      :dismissable-mask="true"
    >
      <div class="ai-picker-list">
        <button
          type="button"
          class="ai-picker-option"
          :class="{ 'ai-picker-option--active': !ctx.routingPickerCurrentModelId.value }"
          @click="ctx.pickModelForTask(null)"
        >
          <div class="ai-picker-copy">
            <div class="ai-picker-name">未设置</div>
            <div class="ai-picker-sub">该任务将无默认模型</div>
          </div>
          <i
            v-if="!ctx.routingPickerCurrentModelId.value"
            class="pi pi-check ai-picker-check"
            aria-hidden="true"
          />
        </button>

        <button
          v-for="model in ctx.routingPickerOptions.value"
          :key="model.id"
          type="button"
          class="ai-picker-option"
          :class="{
            'ai-picker-option--active': model.id === ctx.routingPickerCurrentModelId.value,
          }"
          @click="ctx.pickModelForTask(model.id)"
        >
          <div class="ai-picker-copy">
            <div class="ai-picker-name">{{ model.name }}</div>
            <div class="ai-picker-sub">
              {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
            </div>
          </div>
          <i
            v-if="model.id === ctx.routingPickerCurrentModelId.value"
            class="pi pi-check ai-picker-check"
            aria-hidden="true"
          />
        </button>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.desktop-ai-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.1rem 1.25rem;
}

.ai-header-actions {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.ai-search-group {
  min-width: min(24rem, 100%);
  flex: 1 1 22rem;
  max-width: 28rem;
}

.ai-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}

.ai-metric-card {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 0.95rem 1rem;
}

.ai-metric-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.48);
}

.ai-metric-value {
  margin-top: 0.45rem;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: clamp(1.3rem, 0.55vw + 1.1rem, 1.7rem);
  font-weight: 600;
  color: rgba(247, 244, 236, 0.96);
}

.ai-loading-shell {
  flex: 1;
  min-height: 0;
}

.ai-loading-surface,
.ai-loading-state {
  height: 100%;
}

.ai-loading-state,
.ai-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.ai-workbench-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(20rem, 0.8fr);
  gap: 1rem;
}

.ai-models-surface,
.ai-routing-surface {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ai-surface-banner {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(186, 201, 219, 0.05);
  color: #bac9db;
  font-size: 0.82rem;
}

.ai-data-view {
  flex: 1;
  min-height: 0;
}

.ai-group-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ai-provider-group {
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 1rem;
}

.ai-provider-head {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 0.9rem;
}

.ai-provider-badge {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  border: 1px solid;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.ai-provider-copy {
  min-width: 0;
}

.ai-provider-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.1rem;
  color: rgba(247, 244, 236, 0.96);
}

.ai-provider-summary {
  margin: 0.2rem 0 0;
  font-size: 0.86rem;
  color: rgba(247, 244, 236, 0.58);
}

.ai-model-list {
  display: grid;
  gap: 0.8rem;
}

.ai-model-card {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 12, 18, 0.68);
  padding: 0.95rem;
}

.ai-model-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.ai-model-copy {
  min-width: 0;
  flex: 1;
}

.ai-model-name-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.ai-model-name {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1rem;
  color: rgba(247, 244, 236, 0.96);
}

.ai-model-subtitle {
  margin: 0.25rem 0 0;
  color: rgba(247, 244, 236, 0.56);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.74rem;
}

.ai-model-actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.ai-model-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 0.8rem;
}

.ai-model-meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  font-size: 0.8rem;
  color: rgba(247, 244, 236, 0.52);
}

.ai-model-meta-item strong {
  color: rgba(247, 244, 236, 0.88);
  font-weight: 600;
}

.ai-model-meta-item--full {
  grid-column: 1 / -1;
}

.ai-model-mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.74rem;
}

.ai-routing-head {
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ai-routing-eyebrow {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(186, 201, 219, 0.82);
}

.ai-routing-title {
  margin: 0.45rem 0 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.45rem;
  color: rgba(247, 244, 236, 0.96);
}

.ai-routing-description {
  margin: 0.4rem 0 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: rgba(247, 244, 236, 0.62);
}

.ai-routing-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 1rem;
}

.ai-routing-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  width: 100%;
  padding: 0.9rem 0.95rem;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(247, 244, 236, 0.88);
  cursor: pointer;
  transition:
    border-color 160ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 160ms cubic-bezier(0.4, 0, 0.2, 1),
    background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ai-routing-row:hover {
  transform: translateY(-1px);
  border-color: rgba(186, 201, 219, 0.22);
  background: rgba(255, 255, 255, 0.05);
}

.ai-routing-row--empty {
  color: rgba(247, 244, 236, 0.65);
}

.ai-routing-row-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
}

.ai-routing-row-label {
  font-size: 0.82rem;
  font-weight: 600;
}

.ai-routing-row-value {
  font-size: 0.78rem;
  color: rgba(247, 244, 236, 0.55);
}

.ai-picker-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.ai-picker-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 0.85rem 0.9rem;
  color: rgba(247, 244, 236, 0.88);
  cursor: pointer;
}

.ai-picker-option--active {
  border-color: rgba(186, 201, 219, 0.28);
  background: rgba(186, 201, 219, 0.08);
}

.ai-picker-copy {
  min-width: 0;
  text-align: left;
}

.ai-picker-name {
  font-weight: 600;
}

.ai-picker-sub {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: rgba(247, 244, 236, 0.56);
}

.ai-picker-check {
  color: #bac9db;
}

:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0 0 1rem;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02) !important;
}

@media (max-width: 1200px) {
  .ai-metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ai-workbench-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .desktop-ai-page {
    padding-inline: 0.85rem;
  }

  .ai-header-actions {
    justify-content: stretch;
  }

  .ai-header-actions > * {
    width: 100%;
  }

  .ai-search-group {
    min-width: 0;
    max-width: none;
  }

  .ai-metrics-grid,
  .ai-model-meta-grid {
    grid-template-columns: 1fr;
  }

  .ai-model-card-head {
    flex-direction: column;
  }

  .ai-model-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
