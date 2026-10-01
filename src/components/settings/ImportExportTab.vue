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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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

  const result = SettingsService.exportSettings(settings, settingsStore.uiLocale);

  if (result.success) {
    toast.add({
      severity: 'success',
      summary: t('settingsUi.importExport.exported'),
      detail: result.message || t('settingsUi.importExport.exportedDetail'),
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: t('settingsUi.importExport.exportFailed'),
      detail: result.error || t('settingsUi.importExport.exportFailedDetail'),
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
  const result = await SettingsService.importSettingsFromFile(file, settingsStore.uiLocale);

  if (result.success && result.data) {
    await applyImportedData(result.data);
    toast.add({
      severity: 'success',
      summary: t('settingsUi.importExport.imported'),
      detail: result.message || t('settingsUi.importExport.importedDetail'),
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: t('settingsUi.importExport.importFailed'),
      detail: result.error || t('settingsUi.importExport.importFailedDetail'),
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
          <h3 class="text-sm font-medium text-moon/90 mb-1">
            {{ t('settingsUi.importExport.importTitle') }}
          </h3>
          <p class="text-xs text-moon/70">
            {{ t('settingsUi.importExport.importHint') }}
          </p>
        </div>
        <Button
          :label="t('settingsUi.importExport.importTitle')"
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
          <h3 class="text-sm font-medium text-moon/90 mb-1">
            {{ t('settingsUi.importExport.exportTitle') }}
          </h3>
          <p class="text-xs text-moon/70">
            {{ t('settingsUi.importExport.exportHint') }}
          </p>
        </div>
        <Button
          :label="t('settingsUi.importExport.exportTitle')"
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
