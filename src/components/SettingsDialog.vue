<script setup lang="ts">
import { ref } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { SettingsService } from 'src/services/settings-service';
import type { Settings } from 'src/types/settings';
import type { AIModelDefaultTasks } from 'src/types/ai/ai-model';
import InputNumber from 'primevue/inputnumber';
import Dropdown from 'primevue/dropdown';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const settingsStore = useSettingsStore();
const toast = useToastWithHistory();

// 隐藏的文件输入
const fileInputRef = ref<HTMLInputElement | null>(null);

// 任务配置
const taskLabels: Record<keyof AIModelDefaultTasks, string> = {
  translation: '翻译',
  proofreading: '校对',
  polishing: '润色',
  characterExtraction: '角色提取',
  terminologyExtraction: '术语提取',
  termsTranslation: '术语翻译',
};

// 获取指定任务的可用模型选项（只显示该任务 isDefault 中 enabled 为 true 的模型）
const getModelOptionsForTask = (task: keyof AIModelDefaultTasks) => {
  const enabledModels = aiModelsStore.enabledModels;
  // 过滤出支持该任务的模型（isDefault[task].enabled === true）
  const availableModels = enabledModels.filter((model) => model.isDefault[task]?.enabled === true);
  return [
    { label: '未设置', value: null },
    ...availableModels.map((model) => ({
      label: model.name,
      value: model.id,
    })),
  ];
};

// 获取任务的默认模型 ID
// 如果当前选中的模型不再支持该任务，自动清除该设置
const getTaskModelId = (task: keyof AIModelDefaultTasks): string | null | undefined => {
  const modelId = settingsStore.getTaskDefaultModelId(task);
  if (modelId) {
    // 检查该模型是否仍然支持该任务
    const model = aiModelsStore.getModelById(modelId);
    if (!model || !model.enabled || !model.isDefault[task]?.enabled) {
      // 模型不存在、已禁用或不再支持该任务，清除设置
      settingsStore.setTaskDefaultModelId(task, null);
      return null;
    }
  }
  return modelId;
};

// 设置任务的默认模型 ID
const setTaskModelId = (task: keyof AIModelDefaultTasks, modelId: string | null) => {
  settingsStore.setTaskDefaultModelId(task, modelId);
};

/**
 * 导出设置到 JSON 文件
 */
const exportSettings = () => {
  // 同步最新的 AI 模型、书籍数据、封面历史和应用设置
  const settings: Settings = {
    aiModels: [...aiModelsStore.models],
    sync: [],
    novels: [...booksStore.books],
    coverHistory: [...coverHistoryStore.covers],
    appSettings: settingsStore.getAllSettings(),
  };

  const result = SettingsService.exportSettings(settings);

  if (result.success) {
    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: result.message || '设置已成功导出到本地文件',
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: result.error || '导出设置时发生未知错误',
      life: 5000,
    });
  }
};

/**
 * 导入设置
 */
const importSettings = () => {
  // 触发文件选择
  fileInputRef.value?.click();
};

/**
 * 处理文件选择
 */
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    return;
  }

  // 使用设置服务导入文件
  const result = await SettingsService.importSettingsFromFile(file);

  if (result.success && result.data) {
    // 覆盖当前的 AI 模型数据
    if (result.data.models.length > 0) {
      aiModelsStore.clearModels();
      result.data.models.forEach((model) => {
        aiModelsStore.addModel(model);
      });
    }

    // 覆盖当前的书籍数据
    if (result.data.novels.length > 0) {
      booksStore.clearBooks();
      result.data.novels.forEach((novel) => {
        booksStore.addBook(novel);
      });
    }

    // 覆盖当前的封面历史数据
    if (result.data.coverHistory.length > 0) {
      // 先清空现有封面历史，然后添加导入的数据
      coverHistoryStore.clearHistory();
      result.data.coverHistory.forEach((cover) => {
        coverHistoryStore.addCover(cover);
      });
    }

    // 覆盖当前的应用设置
    if (result.data.appSettings) {
      settingsStore.importSettings(result.data.appSettings);
    }

    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: result.message || '设置已成功导入',
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: result.error || '导入设置时发生未知错误',
      life: 5000,
    });
  }

  // 清空输入
  target.value = '';
};

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    header="设置"
    :modal="true"
    :style="{ width: '800px', height: '700px' }"
    :closable="true"
    :draggable="false"
    :resizable="false"
    class="settings-dialog"
    @update:visible="$emit('update:visible', $event)"
    @hide="handleClose"
  >
    <TabView class="settings-tabview">
      <!-- AI 模型默认设置 -->
      <TabPanel header="AI 模型">
        <div class="p-4 space-y-3">
          <div>
            <h3 class="text-sm font-medium text-moon/90 mb-1">AI 模型默认设置</h3>
            <p class="text-xs text-moon/70">
              为不同任务选择默认使用的 AI 模型，这些设置会随导入/导出一起保存
            </p>
          </div>
          <div class="space-y-3">
            <template v-for="(label, task) in taskLabels" :key="task">
              <div class="space-y-2">
                <label class="text-xs text-moon/80">{{ label }}</label>
                <Dropdown
                  :model-value="getTaskModelId(task)"
                  :options="getModelOptionsForTask(task)"
                  option-label="label"
                  option-value="value"
                  placeholder="选择模型"
                  class="w-full"
                  @update:model-value="(value) => setTaskModelId(task, value)"
                />
              </div>
            </template>
          </div>
        </div>
      </TabPanel>

      <!-- 爬虫设置 -->
      <TabPanel header="爬虫设置">
        <div class="p-4 space-y-3">
          <div>
            <h3 class="text-sm font-medium text-moon/90 mb-1">爬虫设置</h3>
            <p class="text-xs text-moon/70">配置爬虫的并发请求数量，避免超过 API 限制</p>
          </div>
          <div class="space-y-2">
            <label class="text-xs text-moon/80">并发数限制 (1-10)</label>
            <InputNumber
              :model-value="settingsStore.scraperConcurrencyLimit"
              :min="1"
              :max="10"
              :show-buttons="true"
              class="w-full"
              @update:model-value="
                (value) => settingsStore.setScraperConcurrencyLimit(Number(value))
              "
            />
            <p class="text-xs text-moon/60">同时进行的请求数量，建议值：3</p>
          </div>
        </div>
      </TabPanel>

      <!-- 导入/导出资料 -->
      <TabPanel header="导入/导出">
        <div class="p-4 space-y-4">
          <!-- 导入资料 -->
          <div class="p-4 rounded-lg border border-white/10 bg-white/5">
            <div class="space-y-3">
              <div>
                <h3 class="text-sm font-medium text-moon/90 mb-1">导入资料</h3>
                <p class="text-xs text-moon/70">
                  从 JSON 或 TXT 文件导入设置，将覆盖当前的 AI
                  模型配置、书籍数据、封面历史和应用设置
                </p>
              </div>
              <Button
                label="导入资料"
                icon="pi pi-upload"
                class="p-button-primary w-full"
                @click="importSettings"
              />
            </div>
          </div>

          <!-- 导出资料 -->
          <div class="p-4 rounded-lg border border-white/10 bg-white/5">
            <div class="space-y-3">
              <div>
                <h3 class="text-sm font-medium text-moon/90 mb-1">导出资料</h3>
                <p class="text-xs text-moon/70">
                  将当前设置（包括 AI 模型配置、书籍数据、封面历史和应用设置）导出为 JSON 文件
                </p>
              </div>
              <Button
                label="导出资料"
                icon="pi pi-download"
                class="p-button-outlined w-full"
                @click="exportSettings"
              />
            </div>
          </div>
        </div>
      </TabPanel>
    </TabView>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </Dialog>
</template>

<style scoped>
.settings-tabview {
  height: 100%;
}

.settings-tabview :deep(.p-tabview-panels) {
  height: calc(100% - 3rem);
  overflow-y: auto;
}

.settings-tabview :deep(.p-tabview-panel) {
  height: 100%;
}
</style>
