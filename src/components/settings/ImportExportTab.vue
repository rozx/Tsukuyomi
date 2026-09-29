<script setup lang="ts">
import { v4 } from 'uuid';
import { SyncDataService } from 'src/services/sync-data-service';
import Button from 'primevue/button';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useFilePicker } from 'src/composables/dialogs/useFilePicker';
import { loadBooksWithContentAndMemories } from 'src/composables/useElectronSettings';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { SettingsService } from 'src/services/settings-service';
import type { ImportResult } from 'src/models/settings';

type ImportedSettings = NonNullable<ImportResult['data']>;

const toast = useToastWithHistory();
const aiModelsStore = useAIModelsStore();
const booksStore = useBooksStore();
const coverHistoryStore = useCoverHistoryStore();
const settingsStore = useSettingsStore();

const {
  fileInputRef,
  triggerFilePicker: importSettings,
  createFileSelectHandler,
} = useFilePicker();

/**
 * 导出设置到 JSON 文件
 */
const exportSettings = async () => {
  const { novelsWithContent, memories } = await loadBooksWithContentAndMemories(booksStore.books);

  // 同步最新的 AI 模型、书籍数据、封面历史、Memory、同步设置和应用设置
  const settings = {
    aiModels: [...aiModelsStore.models],
    sync: [...settingsStore.syncs],
    novels: novelsWithContent,
    coverHistory: [...coverHistoryStore.covers],
    memories,
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

const applyImportedData = (data: ImportedSettings) =>
  SyncDataService.importSettingsSnapshot(data, v4());

/**
 * 处理文件选择
 */
const handleFileSelect = createFileSelectHandler(async (file) => {
  // 使用设置服务导入文件
  const result = await SettingsService.importSettingsFromFile(file);

  if (result.success && result.data) {
    await applyImportedData(result.data);
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
});
</script>

<template>
  <div class="p-4 space-y-4">
    <!-- 导入资料 -->
    <div class="p-4 rounded-lg border border-white/10 bg-white/5">
      <div class="space-y-3">
        <div>
          <h3 class="text-sm font-medium text-moon/90 mb-1">导入资料</h3>
          <p class="text-xs text-moon/70">
            从 JSON 或 TXT 文件导入设置，将覆盖当前的 AI
            模型配置、书籍数据、封面历史、Memory、同步设置和应用设置
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
            将当前设置（包括 AI 模型配置、书籍数据、封面历史、Memory、同步设置和应用设置）导出为
            JSON 文件
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

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </div>
</template>
