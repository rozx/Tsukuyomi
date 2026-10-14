import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SettingsImportStage } from 'src/services/sync-data-service';

export type SettingsTransferStage = 'reading' | SettingsImportStage | 'exporting';

/** 最近一次导入 / 导出的结果，留在页面上直到下一次操作开始 */
export interface SettingsTransferResult {
  kind: 'import' | 'export';
  ok: boolean;
  /** 结果说明（完成时按当时界面语言生成，与 toast 一致） */
  detail: string;
  /** 完成时间（毫秒时间戳） */
  at: number;
}

/**
 * 设置页「导入 / 导出资料」的进行状态，仅内存。
 * 放在 store 而非组件里：切换选项卡会卸载 ImportExportTab，进度、按钮禁用与上次结果需要保留，
 * 同时保证设置页同一时间只有一个导入或导出（跨卸载仍然生效）。
 */
export const useSettingsTransferStore = defineStore('settings-transfer', () => {
  const busy = ref<SettingsTransferResult['kind'] | null>(null);
  const stage = ref<SettingsTransferStage | null>(null);
  const lastResult = ref<SettingsTransferResult | null>(null);
  /** 本机 Memory 总数（导入会整体替换）；统计中或出错时为 null */
  const memoryCount = ref<number | null>(null);
  return { busy, stage, lastResult, memoryCount };
});
