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

const { t, locale } = useI18n();
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

const finishedAt = (at: number) =>
  t('settingsUi.importExport.finishedAt', {
    time: new Date(at).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }),
  });
const { fileInputRef, triggerFilePicker, createFileSelectHandler } = useFilePicker();

const handleFileSelect = createFileSelectHandler(importFromFile);
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
        <div
          class="rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2"
          data-testid="settings-current-data"
        >
          <p class="text-xs text-amber-200/90 mb-1.5">
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
        <Button
          :label="t('settingsUi.importExport.importTitle')"
          icon="pi pi-upload"
          class="p-button-primary w-full"
          :loading="busy === 'import'"
          :disabled="busy !== null"
          @click="triggerFilePicker"
        />
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
        <div
          v-if="lastResult?.kind === 'import'"
          class="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
          :class="
            lastResult.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
          "
          role="status"
          data-testid="settings-import-result"
        >
          <i
            :class="lastResult.ok ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'"
            class="mt-0.5"
            aria-hidden="true"
          />
          <div class="min-w-0 space-y-0.5">
            <p class="break-words">{{ lastResult.detail }}</p>
            <p class="opacity-70">{{ finishedAt(lastResult.at) }}</p>
          </div>
        </div>
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
          :loading="busy === 'export'"
          :disabled="busy !== null"
          @click="exportSettings"
        />
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
        <div
          v-if="lastResult?.kind === 'export'"
          class="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
          :class="
            lastResult.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
          "
          role="status"
          data-testid="settings-export-result"
        >
          <i
            :class="lastResult.ok ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'"
            class="mt-0.5"
            aria-hidden="true"
          />
          <div class="min-w-0 space-y-0.5">
            <p class="break-words">{{ lastResult.detail }}</p>
            <p class="opacity-70">{{ finishedAt(lastResult.at) }}</p>
          </div>
        </div>
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
