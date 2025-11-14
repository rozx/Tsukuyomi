<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Dialog from 'primevue/dialog';
import Tag from 'primevue/tag';
import type { AIModel } from 'src/types/ai-model';
import { useAIModelsStore } from 'src/stores/ai-models';

const aiModelsStore = useAIModelsStore();

// 使用 store 中的模型列表
const aiModels = computed(() => aiModelsStore.models);

const selectedModel = ref<AIModel | null>(null);
const showAddDialog = ref(false);
const showEditDialog = ref(false);

const addModel = () => {
  showAddDialog.value = true;
};

const editModel = (model: AIModel) => {
  selectedModel.value = { ...model };
  showEditDialog.value = true;
};

const deleteModel = (model: AIModel) => {
  aiModelsStore.deleteModel(model.id);
};

const getProviderLabel = (provider: string) => {
  return provider === 'openai' ? 'OpenAI' : 'Gemini';
};

const getDefaultTasks = (model: AIModel) => {
  const tasks: string[] = [];
  if (model.isDefault.translation) tasks.push('翻译');
  if (model.isDefault.proofreading) tasks.push('校对');
  if (model.isDefault.polishing) tasks.push('润色');
  if (model.isDefault.characterExtraction) tasks.push('角色提取');
  if (model.isDefault.terminologyExtraction) tasks.push('术语提取');
  return tasks.join('、') || '无';
};
</script>

<template>
  <div class="w-full h-full p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">AI 模型管理</h1>
        <p class="text-moon/70 mt-1">管理可用的 AI 翻译模型配置</p>
      </div>
      <Button label="添加 AI 模型" icon="pi pi-plus" @click="addModel" class="p-button-primary" />
    </div>

    <div v-if="aiModels.length === 0" class="text-center py-12">
      <i class="pi pi-sparkles text-4xl text-moon/50 mb-4" />
      <p class="text-moon/70">暂无配置的 AI 模型</p>
      <Button
        label="添加第一个 AI 模型"
        icon="pi pi-plus"
        @click="addModel"
        class="p-button-primary mt-4"
      />
    </div>

    <div v-else class="grid grid-cols-1 gap-4">
      <Card v-for="model in aiModels" :key="model.id" class="hover:bg-white/5 transition-colors">
        <template #header>
          <div class="p-4 border-b border-white/10">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i
                  class="pi pi-sparkles text-xl"
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
                  icon="pi pi-pencil"
                  class="p-button-text p-button-sm"
                  @click="editModel(model)"
                />
                <Button
                  icon="pi pi-trash"
                  class="p-button-text p-button-sm p-button-danger"
                  @click="deleteModel(model)"
                />
              </div>
            </div>
          </div>
        </template>
        <template #content>
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
                <span class="ml-2 font-mono text-xs">{{ model.apiKey }}</span>
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
        </template>
      </Card>
    </div>

    <!-- 添加/编辑对话框将在后续实现 -->
    <Dialog
      v-model:visible="showAddDialog"
      header="添加 AI 模型"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <p class="text-moon/70">添加 AI 模型表单将在后续实现</p>
      <template #footer>
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text"
          @click="showAddDialog = false"
        />
        <Button label="保存" icon="pi pi-check" @click="showAddDialog = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showEditDialog"
      header="编辑 AI 模型"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <p class="text-moon/70">编辑 AI 模型表单将在后续实现</p>
      <template #footer>
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text"
          @click="showEditDialog = false"
        />
        <Button label="保存" icon="pi pi-check" @click="showEditDialog = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
:deep(.p-card) {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

:deep(.p-card-body) {
  padding: 0;
}
</style>
