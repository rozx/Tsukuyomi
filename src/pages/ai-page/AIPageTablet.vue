<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ProgressSpinner from 'primevue/progressspinner';
import Dialog from 'primevue/dialog';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';
import { isPortrait } from 'src/utils/device-orientation';

const ctx = injectAIPage();

const routingPickerVisible = computed({
  get: () => !!ctx.routingPickerTask.value,
  set: (value: boolean) => {
    if (!value) ctx.closeTaskRoutingPicker();
  },
});

// 横屏：路由侧栏始终参与 flex 布局；竖屏：变成右侧滑入抽屉，默认收起
const isRoutingOpen = ref(!isPortrait());
function toggleRouting(): void {
  isRoutingOpen.value = !isRoutingOpen.value;
}
</script>

<template>
  <div class="ai-tablet" :class="{ 'ai-tablet--routing-open': isRoutingOpen }">
    <div
      v-if="isRoutingOpen"
      class="ait-scrim"
      aria-hidden="true"
      @click="toggleRouting"
    />

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
          class="p-button-primary p-button-sm ait-add-btn"
          @click="ctx.addModel"
        />
        <Button
          icon="pi pi-plus"
          class="p-button-primary p-button-sm ait-add-btn-compact"
          title="添加 AI 模型"
          aria-label="添加 AI 模型"
          @click="ctx.addModel"
        />
        <Button
          icon="pi pi-sliders-h"
          :class="[
            'p-button-sm ait-routing-toggle',
            isRoutingOpen ? 'p-button-primary' : 'p-button-outlined',
          ]"
          title="任务路由"
          aria-label="任务路由"
          @click="toggleRouting"
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
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  color: var(--moon-50-opacity-92); /* token: moon-50 @ 92% */
  overflow: hidden;
}

.ait-scrim {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  z-index: 15;
}

.ait-head {
  padding: 22px 32px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
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
  color: var(--tsukuyomi-300-opacity-75); /* token: tsukuyomi-300 @ 75% */
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 4px;
}

.ait-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  line-height: 1.1;
  margin: 0;
}

.ait-subtitle {
  font-size: 12px;
  color: var(--moon-50-opacity-55);
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

/* 横屏只显示带文字的 Add 按钮；路由切换按钮在横屏隐藏（侧栏常驻） */
.ait-add-btn-compact,
.ait-routing-toggle {
  display: none;
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
  color: var(--moon-50-opacity-60);
  font-size: 13px;
}

.ait-byok {
  padding: 11px 14px;
  background: var(--tsukuyomi-opacity-8); /* token: tsukuyomi-500 @ 8% */
  border: 1px solid var(--tsukuyomi-opacity-25);
  border-radius: 10px;
  font-size: 12px;
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
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
  color: var(--moon-50-opacity-50);
}

.ait-empty {
  padding: 48px 20px;
  text-align: center;
  color: var(--moon-50-opacity-70);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.ait-empty-icon {
  font-size: 42px;
  color: var(--moon-50-opacity-35); /* token: moon-50 @ 35% */
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
  color: var(--moon-50-opacity-100);
}

.ait-group-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-50);
}

.ait-model {
  padding: 14px 16px;
  background: var(--white-opacity-2-5); /* token: white @ 2.5% */
  border: 1px solid var(--white-opacity-8);
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
  color: var(--moon-50-opacity-50);
}

.ait-model-icon-on {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.ait-model-title {
  flex: 1;
  min-width: 0;
}

.ait-model-name {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-model-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-50);
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
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-8);
  color: var(--moon-50-opacity-50);
}

.ait-badge-green {
  background: var(--color-success-300-opacity-10); /* token: success-300 @ 10% */
  border-color: var(--color-success-300-opacity-28); /* token: success-300 @ 28% */
  color: var(--color-success-200); /* token: success-200 */
}

.ait-icon-btn :deep(.p-button-icon) {
  font-size: 12px;
}

.ait-params {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--white-opacity-5);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.ait-param-full {
  grid-column: 1 / span 4;
}

.ait-param-label {
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ait-param-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--moon-50-opacity-78); /* token: moon-50 @ 78% */
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-param-value.ait-param-accent {
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.ait-param-mono {
  font-size: 11px;
}

/* Routing sidebar */
.ait-routing {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--white-opacity-6);
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  transition:
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-left-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ait-routing-head {
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.ait-routing-eyebrow {
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
}

.ait-routing-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  margin-top: 4px;
}

.ait-routing-sub {
  font-size: 11px;
  color: var(--moon-50-opacity-50);
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
  border-bottom: 1px solid var(--white-opacity-5);
}

.ait-routing-row:last-child {
  border-bottom: none;
}

.ait-routing-task {
  font-size: 12px;
  font-weight: 500;
  color: var(--moon-50-opacity-78); /* token: moon-50 @ 78% */
}

.ait-routing-picker {
  margin-top: 6px;
  width: 100%;
  padding: 8px 10px;
  background: var(--tsukuyomi-opacity-8); /* token: tsukuyomi-500 @ 8% */
  border: 1px solid var(--tsukuyomi-opacity-25);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: inherit;
  transition: background 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ait-routing-picker:hover {
  background: var(--tsukuyomi-opacity-14); /* token: tsukuyomi-500 @ 14% */
}

.ait-routing-picker--empty {
  background: var(--white-opacity-3);
  border-color: var(--white-opacity-8);
}

.ait-routing-picker-icon {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
  color: var(--moon-50-opacity-100);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ait-routing-picker--empty .ait-routing-picker-model {
  color: var(--moon-50-opacity-55);
  font-weight: 400;
}

.ait-routing-picker-chev {
  color: var(--moon-50-opacity-50);
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

/* ───────────── 竖屏：头部栈叠 + 路由变成右侧 overlay 抽屉 ───────────── */
@media (orientation: portrait) {
  .ait-scrim {
    display: block;
  }

  /* 头部：标题与操作栏上下堆叠，避免挤压 */
  .ait-head {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 18px 20px 14px;
  }

  .ait-title {
    font-size: 22px;
  }

  .ait-head-actions {
    gap: 8px;
  }

  .ait-search {
    flex: 1;
    width: auto;
  }

  /* 压缩圆形 Add 按钮替换长按钮 + 路由切换按钮 */
  .ait-add-btn {
    display: none;
  }

  .ait-add-btn-compact,
  .ait-routing-toggle {
    display: inline-flex;
    flex-shrink: 0;
  }

  .ait-add-btn-compact :deep(.p-button-icon),
  .ait-routing-toggle :deep(.p-button-icon) {
    font-size: 13px;
  }

  /* 列表区收紧 padding */
  .ait-models {
    padding: 14px 18px 20px;
  }

  /* 参数 4 列 grid 在窄宽度下挤，改成 2 列 */
  .ait-params {
    grid-template-columns: repeat(2, 1fr);
  }

  .ait-param-full {
    grid-column: 1 / span 2;
  }

  /* 路由侧栏变成 overlay 抽屉，从右侧滑入 */
  .ait-routing {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 320px;
    max-width: 86%;
    z-index: 20;
    background: var(--shell-opacity-96); /* token: night-300 @ 96% */
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: -12px 0 36px rgba(0, 0, 0, 0.55);
  }

  .ai-tablet:not(.ai-tablet--routing-open) .ait-routing {
    transform: translateX(100%);
  }
}
</style>
