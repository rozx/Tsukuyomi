<script setup lang="ts">
/**
 * 设置页「导入 / 导出资料」。流程与进行状态见 useSettingsImportExport：
 * 进行中两个按钮都禁用，下方显示当前阶段与进度条。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useI18n } from 'vue-i18n';
import { useFilePicker } from 'src/composables/dialogs/useFilePicker';
import { useSettingsImportExport } from 'src/composables/settings/useSettingsImportExport';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import ImportExportResult from './ImportExportResult.vue';

const { t } = useI18n();
const { busy, progress, statusText, lastResult, currentData, importFromFile, exportSettings } =
  useSettingsImportExport();

/** 当前数据各项：数量为 null 表示仍在统计 */
const currentItems = computed(() => {
  const data = currentData.value;
  return [
    { key: 'models', value: data.models },
    { key: 'books', value: data.books },
    { key: 'chapters', value: data.chapters },
    { key: 'covers', value: data.covers },
    { key: 'memories', value: data.memories },
    { key: 'syncs', value: data.syncs },
  ] as const;
});

const { fileInputRef, triggerFilePicker, createFileSelectHandler } = useFilePicker();

const handleFileSelect = createFileSelectHandler(importFromFile);
</script>

<template>
  <SettingsPanel>
    <!-- 导入资料 -->
    <SettingsSection
      :title="t('settingsUi.importExport.importTitle')"
      :description="t('settingsUi.importExport.importHint')"
    >
      <div class="import-current-data" data-testid="settings-current-data">
        <p class="import-current-data-title">
          {{ t('settingsUi.importExport.current.title') }}
        </p>
        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <div v-for="item in currentItems" :key="item.key" class="flex justify-between gap-2">
            <dt class="text-moon/60">{{ t(`settingsUi.importExport.current.${item.key}`) }}</dt>
            <dd class="text-moon/90 tabular-nums">
              {{ item.value ?? t('settingsUi.importExport.current.counting') }}
            </dd>
          </div>
        </dl>
      </div>
      <div
        v-if="busy === 'import'"
        class="space-y-1.5"
        role="status"
        aria-live="polite"
        data-testid="settings-import-status"
      >
        <ProgressBar
          :value="progress ?? undefined"
          :mode="progress === null ? 'indeterminate' : 'determinate'"
          :show-value="false"
          style="height: 0.375rem"
        />
        <p class="text-xs text-moon/80">{{ statusText }}</p>
        <p class="text-xs text-moon/50">{{ t('settingsUi.importExport.busyHint') }}</p>
      </div>
      <ImportExportResult
        v-if="lastResult?.kind === 'import'"
        :ok="lastResult.ok"
        :detail="lastResult.detail"
        :at="lastResult.at"
        data-testid="settings-import-result"
      />
      <template #actions>
        <Button
          :label="t('settingsUi.importExport.importTitle')"
          icon="pi pi-upload"
          :loading="busy === 'import'"
          :disabled="busy !== null"
          @click="triggerFilePicker"
        />
      </template>
    </SettingsSection>

    <!-- 导出资料 -->
    <SettingsSection
      :title="t('settingsUi.importExport.exportTitle')"
      :description="t('settingsUi.importExport.exportHint')"
    >
      <div
        v-if="busy === 'export'"
        class="space-y-1.5"
        role="status"
        aria-live="polite"
        data-testid="settings-export-status"
      >
        <ProgressBar mode="indeterminate" style="height: 0.375rem" />
        <p class="text-xs text-moon/80">{{ statusText }}</p>
      </div>
      <ImportExportResult
        v-if="lastResult?.kind === 'export'"
        :ok="lastResult.ok"
        :detail="lastResult.detail"
        :at="lastResult.at"
        data-testid="settings-export-result"
      />
      <template #actions>
        <Button
          :label="t('settingsUi.importExport.exportTitle')"
          icon="pi pi-download"
          outlined
          :loading="busy === 'export'"
          :disabled="busy !== null"
          @click="exportSettings"
        />
      </template>
    </SettingsSection>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </SettingsPanel>
</template>

<style scoped>
.import-current-data {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--white-opacity-6);
  border-radius: 10px;
  background: var(--white-opacity-3);
}

.import-current-data-title {
  margin: 0 0 0.4rem;
  font-size: 0.76rem;
  color: var(--color-warning);
}
</style>
