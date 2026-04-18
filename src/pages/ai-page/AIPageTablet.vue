<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ProgressSpinner from 'primevue/progressspinner';
import Dialog from 'primevue/dialog';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();

const routingPickerVisible = computed({
  get: () => !!ctx.routingPickerTask.value,
  set: (value: boolean) => {
    if (!value) ctx.closeTaskRoutingPicker();
  },
});
</script>

<template>
  <div class="ai-tablet">
    <header class="ait-head">
      <div class="ait-head-text">
        <div class="ait-eyebrow">AI MODELS</div>
        <h1 class="ait-title">AI 模型管理</h1>
        <p class="ait-subtitle">
          管理可用的 AI 翻译模型配置 · 共 {{ ctx.aiModels.value.length }} 个模型，{{
            ctx.aiModels.value.filter((m) => m.enabled).length
          }}
          个已启用
        </p>
      </div>
      <div class="ait-head-actions">
        <InputGroup class="ait-search">
          <InputGroupAddon>
            <i class="pi pi-search" />
          </InputGroupAddon>
          <InputText
            v-model="ctx.searchQuery.value"
            placeholder="搜索模型、提供商或任务…"
          />
          <InputGroupAddon v-if="ctx.searchQuery.value">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-sm"
              @click="ctx.searchQuery.value = ''"
            />
          </InputGroupAddon>
        </InputGroup>
        <Button
          label="添加 AI 模型"
          icon="pi pi-plus"
          class="p-button-primary p-button-sm"
          @click="ctx.addModel"
        />
      </div>
    </header>

    <div class="ait-body">
      <!-- Models list -->
      <div class="ait-models">
        <div v-if="ctx.isPageLoading.value" class="ait-loading">
          <ProgressSpinner
            style="width: 36px; height: 36px"
            stroke-width="4"
            animation-duration=".8s"
            aria-label="加载中"
          />
          <span>正在加载 AI 模型…</span>
        </div>

        <template v-else>
          <!-- BYOK banner -->
          <div class="ait-byok">
            <i class="pi pi-shield" aria-hidden="true" />
            <span>BYOK · 密钥仅存储在本设备 · IndexedDB 加密保存</span>
            <span class="ait-byok-sub">本地加密 · 从未上传</span>
          </div>

          <div v-if="ctx.filteredModels.value.length === 0" class="ait-empty">
            <i class="pi pi-sparkles ait-empty-icon" aria-hidden="true" />
            <p>
              {{ ctx.searchQuery.value ? '未找到匹配的 AI 模型' : '暂无配置的 AI 模型' }}
            </p>
            <Button
              v-if="!ctx.searchQuery.value"
              label="添加第一个 AI 模型"
              icon="pi pi-plus"
              class="p-button-primary"
              @click="ctx.addModel"
            />
          </div>

          <template v-else>
            <div
              v-for="group in ctx.providerGroups.value"
              :key="group.provider"
              class="ait-group"
            >
              <div class="ait-group-head">
                <div
                  class="ait-group-letter"
                  :style="{
                    background: group.color + '22',
                    color: group.color,
                    borderColor: group.color + '55',
                  }"
                >
                  {{ group.letter }}
                </div>
                <span class="ait-group-name">{{ group.label }}</span>
                <span class="ait-group-count">· {{ group.models.length }} 个模型</span>
              </div>

              <div
                v-for="model in group.models.filter((m) =>
                  ctx.filteredModels.value.includes(m),
                )"
                :key="model.id"
                class="ait-model"
              >
                <div class="ait-model-head">
                  <i
                    class="pi pi-sparkles ait-model-icon"
                    :class="{ 'ait-model-icon-on': model.enabled }"
                    aria-hidden="true"
                  />
                  <div class="ait-model-title">
                    <div class="ait-model-name">{{ model.name }}</div>
                    <div class="ait-model-sub">
                      {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
                    </div>
                  </div>
                  <span
                    class="ait-badge"
                    :class="{ 'ait-badge-green': model.enabled }"
                  >
                    {{ model.enabled ? '已启用' : '已禁用' }}
                  </span>
                  <Button
                    icon="pi pi-copy"
                    class="p-button-text p-button-sm ait-icon-btn"
                    title="复制"
                    @click="ctx.duplicateModel(model)"
                  />
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm ait-icon-btn"
                    title="编辑"
                    @click="ctx.editModel(model)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger ait-icon-btn"
                    title="删除"
                    @click="ctx.deleteModel(model)"
                  />
                </div>

                <div class="ait-params">
                  <div class="ait-param">
                    <div class="ait-param-label">温度</div>
                    <div class="ait-param-value">{{ model.temperature }}</div>
                  </div>
                  <div class="ait-param">
                    <div class="ait-param-label">上下文</div>
                    <div class="ait-param-value">{{ model.maxInputTokens }}</div>
                  </div>
                  <div class="ait-param">
                    <div class="ait-param-label">最大输出</div>
                    <div class="ait-param-value">{{ model.maxOutputTokens }}</div>
                  </div>
                  <div class="ait-param">
                    <div class="ait-param-label">API Key</div>
                    <div class="ait-param-value ait-param-mono">
                      {{ ctx.formatApiKey(model.apiKey) }}
                    </div>
                  </div>
                  <div class="ait-param ait-param-full">
                    <div class="ait-param-label">默认任务</div>
                    <div
                      class="ait-param-value"
                      :class="{ 'ait-param-accent': ctx.getDefaultTasks(model) !== '无' }"
                    >
                      {{ ctx.getDefaultTasks(model) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- Task routing sidebar -->
      <aside class="ait-routing">
        <header class="ait-routing-head">
          <div class="ait-routing-eyebrow">TASK ROUTING</div>
          <div class="ait-routing-title">任务路由</div>
          <p class="ait-routing-sub">为不同任务选择默认模型。设置会随 导入 / 导出 一起保存。</p>
        </header>

        <div class="ait-routing-body">
          <div
            v-for="row in ctx.taskRouting.value"
            :key="row.task"
            class="ait-routing-row"
          >
            <div class="ait-routing-task">{{ row.label }}</div>
            <button
              class="ait-routing-picker"
              :class="{ 'ait-routing-picker--empty': !row.modelId }"
              @click="ctx.openTaskRoutingPicker(row.task)"
            >
              <i class="pi pi-sparkles ait-routing-picker-icon" aria-hidden="true" />
              <div class="ait-routing-picker-text">
                <div class="ait-routing-picker-model">{{ row.value }}</div>
              </div>
              <i class="pi pi-chevron-down ait-routing-picker-chev" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </div>

    <Dialog
      v-model:visible="routingPickerVisible"
      :header="ctx.routingPickerTaskLabel.value || '任务路由'"
      modal
      :style="{ width: '480px', maxWidth: '92vw' }"
      :dismissable-mask="true"
    >
      <div class="ait-picker">
        <button
          type="button"
          class="ait-picker-option"
          :class="{ 'ait-picker-option-active': !ctx.routingPickerCurrentModelId.value }"
          @click="ctx.pickModelForTask(null)"
        >
          <div class="ait-picker-option-body">
            <div class="ait-picker-option-name">未设置</div>
            <div class="ait-picker-option-sub">该任务将无默认模型</div>
          </div>
          <i
            v-if="!ctx.routingPickerCurrentModelId.value"
            class="pi pi-check ait-picker-check"
            aria-hidden="true"
          />
        </button>
        <button
          v-for="model in ctx.routingPickerOptions.value"
          :key="model.id"
          type="button"
          class="ait-picker-option"
          :class="{
            'ait-picker-option-active': model.id === ctx.routingPickerCurrentModelId.value,
          }"
          @click="ctx.pickModelForTask(model.id)"
        >
          <div class="ait-picker-option-body">
            <div class="ait-picker-option-name">{{ model.name }}</div>
            <div class="ait-picker-option-sub">
              {{ ctx.getProviderLabel(model.provider) }} · {{ model.model }}
            </div>
          </div>
          <i
            v-if="model.id === ctx.routingPickerCurrentModelId.value"
            class="pi pi-check ait-picker-check"
            aria-hidden="true"
          />
        </button>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.ai-tablet {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  color: rgba(247, 244, 236, 0.92);
}

.ait-head {
  padding: 22px 32px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: flex-end;
  gap: 20px;
  flex-shrink: 0;
}

.ait-head-text {
  flex: 1;
  min-width: 0;
}

.ait-eyebrow {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(163, 183, 207, 0.75);
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 4px;
}

.ait-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.015em;
  line-height: 1.1;
  margin: 0;
}

.ait-subtitle {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.55);
  margin: 6px 0 0;
}

.ait-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ait-search {
  width: 280px;
  min-width: 0;
}

.ait-body {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ait-models {
  flex: 1;
  overflow-y: auto;
  padding: 18px 32px 24px;
  min-width: 0;
}

.ait-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 20px;
  color: rgba(247, 244, 236, 0.6);
  font-size: 13px;
}

.ait-byok {
  padding: 11px 14px;
  background: rgba(109, 136, 168, 0.08);
  border: 1px solid rgba(109, 136, 168, 0.25);
  border-radius: 10px;
  font-size: 12px;
  color: #bac9db;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.ait-byok i {
  font-size: 14px;
}

.ait-byok-sub {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
}

.ait-empty {
  padding: 48px 20px;
  text-align: center;
  color: rgba(247, 244, 236, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.ait-empty-icon {
  font-size: 42px;
  color: rgba(247, 244, 236, 0.35);
}

.ait-group {
  margin-bottom: 14px;
}

.ait-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0 2px;
}

.ait-group-letter {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 700;
  font-size: 11px;
}

.ait-group-name {
  font-size: 12px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.ait-group-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
}

.ait-model {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-bottom: 8px;
}

.ait-model-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ait-model-icon {
  font-size: 16px;
  color: rgba(247, 244, 236, 0.5);
}

.ait-model-icon-on {
  color: #a3b7cf;
}

.ait-model-title {
  flex: 1;
  min-width: 0;
}

.ait-model-name {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-model-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.5);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(247, 244, 236, 0.5);
}

.ait-badge-green {
  background: rgba(167, 209, 176, 0.1);
  border-color: rgba(167, 209, 176, 0.28);
  color: #b9d9c1;
}

.ait-icon-btn :deep(.p-button-icon) {
  font-size: 12px;
}

.ait-params {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.ait-param-full {
  grid-column: 1 / span 4;
}

.ait-param-label {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ait-param-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(247, 244, 236, 0.78);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-param-value.ait-param-accent {
  color: #bac9db;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.ait-param-mono {
  font-size: 11px;
}

/* Routing sidebar */
.ait-routing {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}

.ait-routing-head {
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ait-routing-eyebrow {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
}

.ait-routing-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  margin-top: 4px;
}

.ait-routing-sub {
  font-size: 11px;
  color: rgba(247, 244, 236, 0.5);
  margin: 6px 0 0;
  line-height: 1.5;
}

.ait-routing-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 20px;
}

.ait-routing-row {
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ait-routing-row:last-child {
  border-bottom: none;
}

.ait-routing-task {
  font-size: 12px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.78);
}

.ait-routing-picker {
  margin-top: 6px;
  width: 100%;
  padding: 8px 10px;
  background: rgba(109, 136, 168, 0.08);
  border: 1px solid rgba(109, 136, 168, 0.25);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: inherit;
  transition: background 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ait-routing-picker:hover {
  background: rgba(109, 136, 168, 0.14);
}

.ait-routing-picker--empty {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}

.ait-routing-picker-icon {
  color: #a3b7cf;
  font-size: 11px;
}

.ait-routing-picker-text {
  flex: 1;
  text-align: left;
  min-width: 0;
}

.ait-routing-picker-model {
  font-size: 12px;
  font-weight: 500;
  color: rgba(247, 244, 236, 1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-routing-picker--empty .ait-routing-picker-model {
  color: rgba(247, 244, 236, 0.55);
  font-weight: 400;
}

.ait-routing-picker-chev {
  color: rgba(247, 244, 236, 0.5);
  font-size: 10px;
}

/* Routing picker dialog */
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
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ait-picker-option:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
}

.ait-picker-option-active {
  background: rgba(109, 136, 168, 0.12);
  border-color: rgba(109, 136, 168, 0.3);
}

.ait-picker-option-body {
  flex: 1;
  min-width: 0;
}

.ait-picker-option-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.ait-picker-option-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
}

.ait-picker-check {
  color: #a3b7cf;
  font-size: 14px;
}
</style>
