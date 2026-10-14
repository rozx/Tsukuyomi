import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { v4 } from 'uuid';
import { SettingsService } from 'src/services/settings-service';
import { SETTINGS_IMPORT_STAGES, SyncDataService } from 'src/services/sync-data-service';
import { loadBooksWithContentAndMemories } from 'src/composables/useElectronSettings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useBooksStore } from 'src/stores/books';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useSettingsStore } from 'src/stores/settings';
import { useSettingsTransferStore } from 'src/stores/settings-transfer';
import type { SettingsTransferResult, SettingsTransferStage } from 'src/stores/settings-transfer';
import { translateText } from 'src/i18n/translate';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { MemoryService } from 'src/services/memory-service';
import type { MessageKey } from 'src/i18n/types';

/**
 * 设置页「导入 / 导出资料」：执行流程并暴露进行状态，供界面显示进度、阶段说明并禁用按钮。
 * 同一时间只允许一个导入或导出，进行中再次触发会被忽略。
 * 进行状态与上次结果存在 useSettingsTransferStore 中，切换选项卡（组件卸载）后仍然保留。
 */

/** 导入流程的全部阶段：先读取校验文件，再按服务端顺序写入 */
const IMPORT_FLOW: readonly SettingsTransferStage[] = ['reading', ...SETTINGS_IMPORT_STAGES];

const STAGE_TEXT: Record<SettingsTransferStage, MessageKey> = {
  reading: 'settingsUi.importExport.stage.reading',
  backup: 'settingsUi.importExport.stage.backup',
  models: 'settingsUi.importExport.stage.models',
  novels: 'settingsUi.importExport.stage.novels',
  covers: 'settingsUi.importExport.stage.covers',
  memories: 'settingsUi.importExport.stage.memories',
  settings: 'settingsUi.importExport.stage.settings',
  finalize: 'settingsUi.importExport.stage.finalize',
  exporting: 'settingsUi.importExport.stage.exporting',
};

const OUTCOME_TEXT = {
  import: {
    ok: ['settingsUi.importExport.imported', 'settingsUi.importExport.importedDetail'],
    failed: ['settingsUi.importExport.importFailed', 'settingsUi.importExport.importFailedDetail'],
  },
  export: {
    ok: ['settingsUi.importExport.exported', 'settingsUi.importExport.exportedDetail'],
    failed: ['settingsUi.importExport.exportFailed', 'settingsUi.importExport.exportFailedDetail'],
  },
} as const satisfies Record<
  SettingsTransferResult['kind'],
  Record<'ok' | 'failed', readonly [MessageKey, MessageKey]>
>;

/** 当前已有的数据量（导入会整体替换这些数据）；Memory 需异步统计，统计中或出错时为 null */
export interface CurrentDataSummary {
  models: number;
  books: number;
  chapters: number;
  covers: number;
  memories: number | null;
  syncs: number;
}

export function useSettingsImportExport() {
  const toast = useToastWithHistory();
  const aiModelsStore = useAIModelsStore();
  const booksStore = useBooksStore();
  const coverHistoryStore = useCoverHistoryStore();
  const settingsStore = useSettingsStore();
  const t = (key: MessageKey) => translateText(settingsStore.uiLocale, key);

  const { busy, stage, lastResult, memoryCount } = storeToRefs(useSettingsTransferStore());

  const currentData = computed<CurrentDataSummary>(() => ({
    models: aiModelsStore.models.length,
    books: booksStore.books.length,
    chapters: booksStore.books.reduce(
      (sum, book) =>
        sum + (book.volumes ?? []).reduce((n, volume) => n + (volume.chapters?.length ?? 0), 0),
      0,
    ),
    covers: coverHistoryStore.covers.length,
    memories: memoryCount.value,
    syncs: settingsStore.syncs.length,
  }));

  async function refreshMemoryCount(): Promise<void> {
    try {
      memoryCount.value = await MemoryService.countAllMemories();
    } catch {
      memoryCount.value = null;
    }
  }
  void refreshMemoryCount();

  /** 导入按阶段估算 0–100（不到 100，完成后清空）；导出无法估算时为 null（不确定进度） */
  const progress = computed<number | null>(() => {
    const index = stage.value ? IMPORT_FLOW.indexOf(stage.value) : -1;
    if (index < 0) return null;
    return Math.round(((index + 1) / (IMPORT_FLOW.length + 1)) * 100);
  });
  const statusText = computed(() => (stage.value ? t(STAGE_TEXT[stage.value]) : ''));

  /** 结束一次操作：留下结果状态并弹出 toast；detail 缺省时用通用说明 */
  function finish(kind: SettingsTransferResult['kind'], ok: boolean, detail?: string): void {
    const [summaryKey, detailKey] = OUTCOME_TEXT[kind][ok ? 'ok' : 'failed'];
    const text = detail || t(detailKey);
    lastResult.value = { kind, ok, detail: text, at: Date.now() };
    toast.add({
      severity: ok ? 'success' : 'error',
      summary: t(summaryKey),
      detail: text,
      life: ok ? 3000 : 5000,
    });
  }

  function errorDetail(kind: SettingsTransferResult['kind'], error: unknown): string {
    return localizedErrorMessage(error, settingsStore.uiLocale, OUTCOME_TEXT[kind].failed[1]);
  }

  async function run(kind: 'import' | 'export', work: () => Promise<void>): Promise<void> {
    if (busy.value) return;
    busy.value = kind;
    lastResult.value = null;
    try {
      await work();
    } finally {
      busy.value = null;
      stage.value = null;
    }
  }

  function importFromFile(file: File): Promise<void> {
    return run('import', async () => {
      stage.value = 'reading';
      const result = await SettingsService.importSettingsFromFile(file, settingsStore.uiLocale);
      if (!result.success || !result.data) {
        finish('import', false, result.error);
        return;
      }
      try {
        await SyncDataService.importSettingsSnapshot(result.data, v4(), (next) => {
          stage.value = next;
        });
      } catch (error) {
        finish('import', false, errorDetail('import', error));
        return;
      } finally {
        // 成功会替换 Memory，失败会回滚：两种情况都重新统计
        void refreshMemoryCount();
      }
      finish('import', true, result.message);
    });
  }

  function exportSettings(): Promise<void> {
    return run('export', async () => {
      stage.value = 'exporting';
      let result: ReturnType<typeof SettingsService.exportSettings>;
      try {
        const { novelsWithContent, memories } = await loadBooksWithContentAndMemories(
          booksStore.books,
        );
        result = SettingsService.exportSettings(
          {
            aiModels: [...aiModelsStore.models],
            sync: [...settingsStore.syncs],
            novels: novelsWithContent,
            coverHistory: [...coverHistoryStore.covers],
            memories,
            appSettings: settingsStore.getAllSettings(),
          },
          settingsStore.uiLocale,
        );
      } catch (error) {
        finish('export', false, errorDetail('export', error));
        return;
      }
      finish('export', result.success, result.success ? result.message : result.error);
    });
  }

  return {
    busy,
    stage,
    progress,
    statusText,
    lastResult,
    currentData,
    importFromFile,
    exportSettings,
  };
}
