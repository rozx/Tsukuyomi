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

const aiModelsStore = useAIModelsStore();
const confirm = useConfirm();
const toast = useToastWithHistory();

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
  <div class="h-full flex flex-col p-3 sm:p-4 lg:p-6">
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
                    <span class="text-moon/70">最大输入 Token:</span>
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
</style>
