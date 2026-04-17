<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useConfirm } from 'primevue/useconfirm';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import InputText from 'primevue/inputtext';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ConfirmDialog from 'primevue/confirmdialog';
import ProgressSpinner from 'primevue/progressspinner';
import type { AIModel, AIProvider } from 'src/services/ai/types/ai-model';
import { useAIModelsStore } from 'src/stores/ai-models';
import AIModelDialog from 'src/components/dialogs/AIModelDialog.vue';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { cloneDeep } from 'lodash';
import { useResponsiveLayout } from 'src/composables/useResponsiveLayout';

const aiModelsStore = useAIModelsStore();
const confirm = useConfirm();
const toast = useToastWithHistory();
const { isPhone } = useResponsiveLayout();

// 手机端 provider 分组（同一提供商聚合展示）
type ProviderGroup = {
  provider: AIProvider;
  label: string;
  letter: string;
  color: string;
  models: AIModel[];
  enabledCount: number;
};

const providerPalette: Record<AIProvider, { label: string; letter: string; color: string }> = {
  openai: { label: 'OpenAI', letter: 'O', color: '#10A37F' },
  gemini: { label: 'Google Gemini', letter: 'G', color: '#4A8FE7' },
};

const providerGroups = computed<ProviderGroup[]>(() => {
  const byProvider = new Map<AIProvider, AIModel[]>();
  for (const model of aiModels.value) {
    const list = byProvider.get(model.provider) ?? [];
    list.push(model);
    byProvider.set(model.provider, list);
  }
  const groups: ProviderGroup[] = [];
  for (const [provider, models] of byProvider) {
    const meta = providerPalette[provider] ?? {
      label: provider,
      letter: provider.slice(0, 1).toUpperCase(),
      color: '#6D88A8',
    };
    groups.push({
      provider,
      label: meta.label,
      letter: meta.letter,
      color: meta.color,
      models,
      enabledCount: models.filter((m) => m.enabled).length,
    });
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
});

// 任务路由摘要（首选默认模型）
const taskRouting = computed(() => {
  const pick = (key: keyof AIModel['isDefault']) => {
    const m = aiModels.value.find((x) => x.isDefault?.[key]?.enabled);
    return m ? `${getProviderLabel(m.provider)} · ${m.name}` : '未配置';
  };
  return [
    { label: '翻译 (初译)', value: pick('translation') },
    { label: '校对 / 润色', value: pick('proofreading') },
    { label: '术语翻译', value: pick('termsTranslation') },
    { label: 'AI 助手', value: pick('assistant') },
  ];
});

// 页面加载状态
const isPageLoading = ref(true);

// 使用 store 中的模型列表
const aiModels = computed(() => aiModelsStore.models);

// 组件挂载时加载模型数据
onMounted(async () => {
  if (!aiModelsStore.isLoaded) {
    await aiModelsStore.loadModels();
  }
  isPageLoading.value = false;
});

// 辅助函数
const getProviderLabel = (provider: string) => {
  return provider === 'openai' ? 'OpenAI' : 'Gemini';
};

const getDefaultTasks = (model: AIModel) => {
  const tasks: string[] = [];
  if (model.isDefault.translation?.enabled) tasks.push(TASK_TYPE_LABELS.translation);
  if (model.isDefault.proofreading?.enabled) tasks.push('校对和润色'); // proofreading 任务用于校对和润色
  if (model.isDefault.termsTranslation?.enabled) tasks.push(TASK_TYPE_LABELS.termsTranslation);
  if (model.isDefault.assistant?.enabled) tasks.push(TASK_TYPE_LABELS.assistant);
  return tasks.join('、') || '无';
};

// 搜索关键词
const searchQuery = ref('');

// 过滤后的模型列表
const filteredModels = computed(() => {
  if (!searchQuery.value.trim()) {
    return aiModels.value;
  }
  const query = searchQuery.value.toLowerCase().trim();
  return aiModels.value.filter((model) => {
    const name = model.name.toLowerCase();
    const provider = getProviderLabel(model.provider).toLowerCase();
    const modelName = model.model.toLowerCase();
    const defaultTasks = getDefaultTasks(model).toLowerCase();
    return (
      name.includes(query) ||
      provider.includes(query) ||
      modelName.includes(query) ||
      defaultTasks.includes(query)
    );
  });
});

const selectedModel = ref<AIModel | null>(null);
const showAddDialog = ref(false);
const showEditDialog = ref(false);

// 生成唯一 ID
const generateId = (): string => {
  return uuidv4();
};

// 添加模型
const addModel = () => {
  selectedModel.value = null;
  showAddDialog.value = true;
};

// 编辑模型
const editModel = (model: AIModel) => {
  selectedModel.value = { ...model };
  showEditDialog.value = true;
};

// 复制模型
const duplicateModel = (model: AIModel) => {
  const duplicatedModel: AIModel = {
    ...model,
    id: generateId(),
    name: `${model.name} (副本)`,
    enabled: false, // 复制的模型默认禁用
    lastEdited: new Date(),
  };
  void aiModelsStore.addModel(duplicatedModel);
  toast.add({
    severity: 'success',
    summary: '复制成功',
    detail: `已成功复制模型 "${model.name}"`,
    life: 3000,
    onRevert: () => aiModelsStore.deleteModel(duplicatedModel.id),
  });
};

// 保存模型（添加或编辑）
const handleSave = (formData: Partial<AIModel> & { isDefault: AIModel['isDefault'] }) => {
  if (showAddDialog.value) {
    // 添加新模型
    const newModel: AIModel = {
      id: generateId(),
      name: formData.name!,
      provider: formData.provider as AIProvider,
      model: formData.model!,
      temperature: formData.temperature!,
      maxInputTokens: formData.maxInputTokens!,
      maxOutputTokens: formData.maxOutputTokens!,
      ...(formData.rateLimit !== undefined && formData.rateLimit !== null
        ? { rateLimit: formData.rateLimit }
        : {}),
      apiKey: formData.apiKey!,
      baseUrl: formData.baseUrl!,
      enabled: formData.enabled ?? true,
      useCorsProxy: formData.useCorsProxy,
      isDefault: {
        translation: formData.isDefault?.translation ?? { enabled: false, temperature: 0.7 },
        proofreading: formData.isDefault?.proofreading ?? { enabled: false, temperature: 0.7 },
        termsTranslation: formData.isDefault?.termsTranslation ?? {
          enabled: false,
          temperature: 0.7,
        },
        assistant: formData.isDefault?.assistant ?? { enabled: false, temperature: 0.7 },
      },
      lastEdited: new Date(),
    };
    void aiModelsStore.addModel(newModel);
    showAddDialog.value = false;
    toast.add({
      severity: 'success',
      summary: '添加成功',
      detail: `已成功添加模型 "${newModel.name}"`,
      life: 3000,
      onRevert: () => aiModelsStore.deleteModel(newModel.id),
    });
  } else if (showEditDialog.value && selectedModel.value) {
    // 更新现有模型
    const updates: Partial<AIModel> = {
      name: formData.name!,
      provider: formData.provider as AIProvider,
      model: formData.model!,
      temperature: formData.temperature!,
      maxInputTokens: formData.maxInputTokens!,
      maxOutputTokens: formData.maxOutputTokens!,
      apiKey: formData.apiKey!,
      baseUrl: formData.baseUrl!,
      enabled: formData.enabled ?? true,
      useCorsProxy: formData.useCorsProxy,
      isDefault: {
        translation: formData.isDefault?.translation ?? { enabled: false, temperature: 0.7 },
        proofreading: formData.isDefault?.proofreading ?? { enabled: false, temperature: 0.7 },
        termsTranslation: formData.isDefault?.termsTranslation ?? {
          enabled: false,
          temperature: 0.7,
        },
        assistant: formData.isDefault?.assistant ?? { enabled: false, temperature: 0.7 },
      },
    };

    // 只在有值时才添加可选字段
    if (formData.rateLimit !== undefined && formData.rateLimit !== null) {
      updates.rateLimit = formData.rateLimit;
    }

    // 深拷贝保存原始数据用于撤销
    const oldModel = cloneDeep(selectedModel.value);
    void aiModelsStore.updateModel(selectedModel.value.id, updates);
    showEditDialog.value = false;
    const modelName = updates.name || selectedModel.value.name;
    selectedModel.value = null;
    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: `已成功更新模型 "${modelName}"`,
      life: 3000,
      onRevert: () => aiModelsStore.updateModel(oldModel.id, oldModel),
    });
  }
};

// 删除模型
const deleteModel = (model: AIModel) => {
  confirm.require({
    group: 'ai-model',
    message: `确定要删除模型 "${model.name}" 吗？`,
    header: '确认删除',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
    },
    acceptProps: {
      label: '删除',
      severity: 'danger',
    },
    accept: () => {
      const modelName = model.name;
      // 深拷贝保存原始数据用于撤销
      const modelToRestore = cloneDeep(model);
      void aiModelsStore.deleteModel(model.id);
      toast.add({
        severity: 'success',
        summary: '删除成功',
        detail: `已成功删除模型 "${modelName}"`,
        life: 3000,
        onRevert: () => aiModelsStore.addModel(modelToRestore),
      });
    },
  });
};

// 关闭对话框时重置
watch([showAddDialog, showEditDialog], ([addVisible, editVisible]) => {
  if (!addVisible && !editVisible) {
    selectedModel.value = null;
  }
});

const formatApiKey = (apiKey: string): string => {
  if (!apiKey) return '';
  if (apiKey.length <= 6) return apiKey;
  const prefix = apiKey.substring(0, 6);
  const maskedLength = apiKey.length - 6;
  return prefix + '*'.repeat(maskedLength);
};
</script>

<template>
  <!-- ─────────────── 手机端 · Mobile AI Models ─────────────── -->
  <div v-if="isPhone" class="mobile-ai w-full h-full flex flex-col">
    <header class="ma-largetitle">
      <div class="ma-eyebrow">AI MODELS</div>
      <h1 class="ma-title">AI 模型</h1>
    </header>

    <!-- BYOK 提示 -->
    <div class="ma-byok">
      <i class="pi pi-shield" aria-hidden="true" />
      <span>BYOK · 密钥仅存储在本设备。</span>
    </div>

    <div v-if="isPageLoading" class="ma-state">
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载 AI 模型…</span>
    </div>

    <div v-else-if="aiModels.length === 0" class="ma-state">
      <i class="pi pi-sparkles ma-state-icon" aria-hidden="true" />
      <span class="ma-state-title">暂无配置的 AI 模型</span>
      <Button label="添加第一个 AI 模型" icon="pi pi-plus" class="p-button-primary" @click="addModel" />
    </div>

    <div v-else class="ma-scroll">
      <!-- 提供商分组 -->
      <section class="ma-section">
        <div class="ma-section-head">
          <span class="ma-section-title">提供商</span>
          <button class="ma-add-btn" @click="addModel">
            <i class="pi pi-plus" aria-hidden="true" /> 添加
          </button>
        </div>
        <div class="ma-providers">
          <div
            v-for="group in providerGroups"
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
                @click="editModel(model)"
              >
                <div class="ma-model-main">
                  <div class="ma-model-name">{{ model.name }}</div>
                  <div class="ma-model-meta">{{ model.model }}</div>
                </div>
                <span
                  class="ma-badge"
                  :class="model.enabled ? 'ma-badge--on' : 'ma-badge--off'"
                >
                  {{ model.enabled ? '已启用' : '已禁用' }}
                </span>
                <i class="pi pi-chevron-right ma-chev" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 任务路由 -->
      <section class="ma-section ma-section--last">
        <div class="ma-section-head">
          <span class="ma-section-title">任务路由</span>
        </div>
        <div class="ma-routing-card">
          <div
            v-for="(row, idx) in taskRouting"
            :key="row.label"
            class="ma-routing-row"
            :class="{ 'ma-routing-row--last': idx === taskRouting.length - 1 }"
          >
            <span class="ma-routing-label">{{ row.label }}</span>
            <span class="ma-routing-value" :class="{ 'ma-routing-value--unset': row.value === '未配置' }">
              <i class="pi pi-sparkles" aria-hidden="true" /> {{ row.value }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <AIModelDialog
      v-model:visible="showAddDialog"
      mode="add"
      @save="handleSave"
      @cancel="showAddDialog = false"
    />
    <AIModelDialog
      v-model:visible="showEditDialog"
      mode="edit"
      :model="selectedModel"
      @save="handleSave"
      @cancel="showEditDialog = false"
    />
    <ConfirmDialog group="ai-model" />
  </div>

  <!-- ─────────────── 桌面端 / 平板 ─────────────── -->
  <div v-else class="h-full flex flex-col p-3 sm:p-4 lg:p-6">
    <!-- 固定头部 -->
    <div
      class="flex flex-col md:flex-row md:items-center md:justify-between mb-4 sm:mb-6 flex-shrink-0 gap-3"
    >
      <div class="flex-shrink-0 min-w-0">
        <h1 class="text-2xl font-bold">AI 模型管理</h1>
        <p class="text-moon/70 mt-1">管理可用的 AI 翻译模型配置</p>
      </div>
      <div class="flex w-full md:w-auto items-center gap-2 sm:gap-3 flex-wrap md:flex-nowrap">
        <InputGroup class="search-input-group min-w-0 flex-shrink w-full md:w-auto">
          <InputGroupAddon>
            <i class="pi pi-search text-base" />
          </InputGroupAddon>
          <InputText
            v-model="searchQuery"
            placeholder="搜索模型名称、提供商、模型类型或默认任务..."
            class="search-input"
          />
          <InputGroupAddon v-if="searchQuery" class="input-action-addon">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-sm input-action-button"
              @click="searchQuery = ''"
              title="清除搜索"
            />
          </InputGroupAddon>
        </InputGroup>
        <Button
          label="添加 AI 模型"
          icon="pi pi-plus"
          @click="addModel"
          class="p-button-primary icon-button-hover flex-shrink-0 w-full sm:w-auto"
        />
      </div>
    </div>

    <!-- DataView 内容区域 -->
    <div class="flex-1 flex flex-col min-h-0">
      <!-- 加载指示器 -->
      <div v-if="isPageLoading" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <ProgressSpinner
            style="width: 50px; height: 50px"
            strokeWidth="4"
            animationDuration=".8s"
            aria-label="加载中"
          />
          <p class="text-moon/70 mt-4">正在加载 AI 模型...</p>
        </div>
      </div>
      <DataView
        v-else
        :value="filteredModels"
        data-key="id"
        :rows="10"
        :paginator="filteredModels.length > 0"
        :rows-per-page-options="[5, 10, 20, 50]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
        class="flex-1 flex flex-col min-h-0"
      >
        <template #empty>
          <div class="text-center py-12">
            <i class="pi pi-sparkles text-4xl text-moon/50 mb-4 icon-hover" />
            <p class="text-moon/70">
              {{ searchQuery ? '未找到匹配的 AI 模型' : '暂无配置的 AI 模型' }}
            </p>
            <Button
              v-if="!searchQuery"
              label="添加第一个 AI 模型"
              icon="pi pi-plus"
              @click="addModel"
              class="p-button-primary mt-4 icon-button-hover"
            />
          </div>
        </template>

        <template #list="slotProps">
          <div class="grid grid-cols-1 gap-4">
            <div
              v-for="model in slotProps.items"
              :key="model.id"
              class="bg-white/3 border border-white/10 rounded-lg overflow-hidden hover:bg-white/5 transition-colors"
            >
              <!-- 卡片头部 -->
              <div class="p-4 border-b border-white/10">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <i
                      class="pi pi-sparkles text-xl icon-hover"
                      :class="model.enabled ? 'text-accent-400' : 'text-moon/50'"
                    />
                    <div class="min-w-0">
                      <h3 class="text-lg font-semibold truncate">{{ model.name }}</h3>
                      <p class="text-sm text-moon/70 truncate">
                        {{ getProviderLabel(model.provider) }} · {{ model.model }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <Tag
                      :value="model.enabled ? '已启用' : '已禁用'"
                      :severity="model.enabled ? 'success' : 'secondary'"
                    />
                    <Button
                      icon="pi pi-copy"
                      class="p-button-text p-button-sm icon-button-hover"
                      @click="duplicateModel(model)"
                    />
                    <Button
                      icon="pi pi-pencil"
                      class="p-button-text p-button-sm icon-button-hover"
                      @click="editModel(model)"
                    />
                    <Button
                      icon="pi pi-trash"
                      class="p-button-text p-button-sm p-button-danger icon-button-hover"
                      @click="deleteModel(model)"
                    />
                  </div>
                </div>
              </div>

              <!-- 卡片内容 -->
              <div class="p-4 space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <div>
                    <span class="text-moon/70">温度:</span>
                    <span class="ml-2">{{ model.temperature }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">上下文窗口:</span>
                    <span class="ml-2">{{ model.maxInputTokens }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">最大输出 Token:</span>
                    <span class="ml-2">{{ model.maxOutputTokens }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">API Key:</span>
                    <span class="ml-2 font-mono text-xs">{{ formatApiKey(model.apiKey) }}</span>
                  </div>
                  <div>
                    <span class="text-moon/70">基础地址:</span>
                    <span class="ml-2 font-mono text-xs">{{ model.baseUrl }}</span>
                  </div>
                </div>
                <div class="pt-2 border-t border-white/10">
                  <span class="text-moon/70 text-sm">默认任务:</span>
                  <span class="ml-2 text-sm">{{ getDefaultTasks(model) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </DataView>
    </div>

    <!-- 添加对话框 -->
    <AIModelDialog
      v-model:visible="showAddDialog"
      mode="add"
      @save="handleSave"
      @cancel="showAddDialog = false"
    />

    <!-- 编辑对话框 -->
    <AIModelDialog
      v-model:visible="showEditDialog"
      mode="edit"
      :model="selectedModel"
      @save="handleSave"
      @cancel="showEditDialog = false"
    />

    <!-- 确认对话框 -->
    <ConfirmDialog group="ai-model" />
  </div>
</template>

<style scoped>
/* 所有组件样式已在全局 app.scss 中定义，确保整个应用样式一致 */

/* 使 DataView 使用 flex 布局，内容可滚动，分页器固定在底部 */
:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
}

/* 确保搜索框可以收缩，所有按钮保持在同一行 */
.search-input-group {
  min-width: 0;
  flex: 1 1 auto;
  max-width: 400px;
}

.search-input-group :deep(.p-inputtext) {
  min-width: 0;
}

/* ───────────────── 手机端 AI Models ───────────────── */
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
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.ma-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
  margin: 0;
}

.ma-byok {
  margin: 10px 20px 0;
  padding: 10px 12px;
  background: rgba(109, 136, 168, 0.08);
  border: 1px solid rgba(109, 136, 168, 0.25);
  border-radius: 10px;
  font-size: 12px;
  color: #bac9db;
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
  color: rgba(247, 244, 236, 1);
}

.ma-add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #a3b7cf;
  background: rgba(109, 136, 168, 0.12);
  border: 1px solid rgba(109, 136, 168, 0.3);
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
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

.ma-provider-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(247, 244, 236, 1);
}

.ma-provider-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ma-model-row:last-child {
  border-bottom: none;
}

.ma-model-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.ma-model-main {
  flex: 1;
  min-width: 0;
}

.ma-model-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-model-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
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
  background: rgba(127, 179, 137, 0.12);
  color: #a7d1b0;
  border-color: rgba(127, 179, 137, 0.3);
}

.ma-badge--off {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 0.55);
  border-color: rgba(255, 255, 255, 0.1);
}

.ma-chev {
  color: rgba(247, 244, 236, 0.35);
  font-size: 11px;
}

.ma-routing-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 4px 14px;
}

.ma-routing-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ma-routing-row--last {
  border-bottom: none;
}

.ma-routing-label {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.85);
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
  background: rgba(109, 136, 168, 0.15);
  color: #bac9db;
  border: 1px solid rgba(109, 136, 168, 0.3);
}

.ma-routing-value--unset {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 0.55);
  border-color: rgba(255, 255, 255, 0.1);
}

.ma-routing-value i {
  font-size: 9px;
  opacity: 0.85;
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
  color: rgba(247, 244, 236, 0.6);
  font-size: 13px;
}

.ma-state-icon {
  font-size: 42px;
  color: rgba(247, 244, 236, 0.25);
}

.ma-state-title {
  font-size: 14px;
  color: rgba(247, 244, 236, 0.7);
}
</style>
