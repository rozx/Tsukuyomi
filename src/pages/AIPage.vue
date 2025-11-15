<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import ConfirmDialog from 'primevue/confirmdialog';
import type { AIModel, AIProvider } from 'src/types/ai-model';
import { useAIModelsStore } from 'src/stores/ai-models';
import AIModelDialog from 'src/components/AIModelDialog.vue';

const aiModelsStore = useAIModelsStore();
const confirm = useConfirm();

// 使用 store 中的模型列表
const aiModels = computed(() => aiModelsStore.models);

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
  };
  aiModelsStore.addModel(duplicatedModel);
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
      maxTokens: formData.maxTokens!,
      ...(formData.contextWindow !== undefined && formData.contextWindow !== null ? { contextWindow: formData.contextWindow } : {}),
      ...(formData.rateLimit !== undefined && formData.rateLimit !== null ? { rateLimit: formData.rateLimit } : {}),
      apiKey: formData.apiKey!,
      baseUrl: formData.baseUrl!,
      enabled: formData.enabled ?? true,
      isDefault: {
        translation: formData.isDefault?.translation ?? { enabled: false, temperature: 0.7 },
        proofreading: formData.isDefault?.proofreading ?? { enabled: false, temperature: 0.7 },
        polishing: formData.isDefault?.polishing ?? { enabled: false, temperature: 0.7 },
        characterExtraction: formData.isDefault?.characterExtraction ?? { enabled: false, temperature: 0.7 },
        terminologyExtraction: formData.isDefault?.terminologyExtraction ?? { enabled: false, temperature: 0.7 },
      },
    };
    aiModelsStore.addModel(newModel);
    showAddDialog.value = false;
  } else if (showEditDialog.value && selectedModel.value) {
    // 更新现有模型
    const updates: Partial<AIModel> = {
      name: formData.name!,
      provider: formData.provider as AIProvider,
      model: formData.model!,
      temperature: formData.temperature!,
      maxTokens: formData.maxTokens!,
      apiKey: formData.apiKey!,
      baseUrl: formData.baseUrl!,
      enabled: formData.enabled ?? true,
      isDefault: {
        translation: formData.isDefault?.translation ?? { enabled: false, temperature: 0.7 },
        proofreading: formData.isDefault?.proofreading ?? { enabled: false, temperature: 0.7 },
        polishing: formData.isDefault?.polishing ?? { enabled: false, temperature: 0.7 },
        characterExtraction: formData.isDefault?.characterExtraction ?? { enabled: false, temperature: 0.7 },
        terminologyExtraction: formData.isDefault?.terminologyExtraction ?? { enabled: false, temperature: 0.7 },
      },
    };

    // 只在有值时才添加可选字段
    if (formData.contextWindow !== undefined && formData.contextWindow !== null) {
      updates.contextWindow = formData.contextWindow;
    }
    if (formData.rateLimit !== undefined && formData.rateLimit !== null) {
      updates.rateLimit = formData.rateLimit;
    }

    aiModelsStore.updateModel(selectedModel.value.id, updates);
    showEditDialog.value = false;
    selectedModel.value = null;
  }
};

// 删除模型
const deleteModel = (model: AIModel) => {
  confirm.require({
    message: `确定要删除模型 "${model.name}" 吗？`,
    header: '确认删除',
    icon: 'pi pi-exclamation-triangle',
    rejectClass: 'p-button-text',
    acceptClass: 'p-button-danger',
    rejectLabel: '取消',
    acceptLabel: '删除',
    accept: () => {
      aiModelsStore.deleteModel(model.id);
    },
  });
};

// 关闭对话框时重置
watch([showAddDialog, showEditDialog], ([addVisible, editVisible]) => {
  if (!addVisible && !editVisible) {
    selectedModel.value = null;
  }
});

const getProviderLabel = (provider: string) => {
  return provider === 'openai' ? 'OpenAI' : 'Gemini';
};

const getDefaultTasks = (model: AIModel) => {
  const tasks: string[] = [];
  if (model.isDefault.translation?.enabled) tasks.push('翻译');
  if (model.isDefault.proofreading?.enabled) tasks.push('校对');
  if (model.isDefault.polishing?.enabled) tasks.push('润色');
  if (model.isDefault.characterExtraction?.enabled) tasks.push('角色提取');
  if (model.isDefault.terminologyExtraction?.enabled) tasks.push('术语提取');
  return tasks.join('、') || '无';
};

const formatApiKey = (apiKey: string): string => {
  if (!apiKey) return '';
  if (apiKey.length <= 6) return apiKey;
  const prefix = apiKey.substring(0, 6);
  const maskedLength = apiKey.length - 6;
  return prefix + '*'.repeat(maskedLength);
};
</script>

<template>
  <div class="p-6 space-y-6">
      <!-- 固定头部 -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">AI 模型管理</h1>
          <p class="text-moon/70 mt-1">管理可用的 AI 翻译模型配置</p>
        </div>
        <Button
          label="添加 AI 模型"
          icon="pi pi-plus"
          @click="addModel"
          class="p-button-primary icon-button-hover"
        />
      </div>

      <!-- DataView 内容区域 -->
      <DataView
        :value="aiModels"
        data-key="id"
        :rows="10"
        :paginator="aiModels.length > 0"
        :rows-per-page-options="[5, 10, 20, 50]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      >
      <template #empty>
        <div class="text-center py-12">
          <i class="pi pi-sparkles text-4xl text-moon/50 mb-4 icon-hover" />
          <p class="text-moon/70">暂无配置的 AI 模型</p>
          <Button
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
            class="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden hover:bg-white/5 transition-colors"
          >
            <!-- 卡片头部 -->
            <div class="p-4 border-b border-white/10">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <i
                    class="pi pi-sparkles text-xl icon-hover"
                    :class="model.enabled ? 'text-primary' : 'text-moon/50'"
                  />
                  <div>
                    <h3 class="text-lg font-semibold">{{ model.name }}</h3>
                    <p class="text-sm text-moon/70">
                      {{ getProviderLabel(model.provider) }} · {{ model.model }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
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
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-moon/70">温度:</span>
                  <span class="ml-2">{{ model.temperature }}</span>
                </div>
                <div>
                  <span class="text-moon/70">最大 Token:</span>
                  <span class="ml-2">{{ model.maxTokens }}</span>
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
    <ConfirmDialog />
  </div>
</template>

<style scoped>
/* 所有组件样式已在全局 app.scss 中定义，确保整个应用样式一致 */
</style>
