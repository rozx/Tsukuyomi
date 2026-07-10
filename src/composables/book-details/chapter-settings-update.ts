import type { Novel } from 'src/models/novel';
import { resolveTaskChunkSize } from 'src/services/ai/tasks/utils/chunk-formatter';

/**
 * 翻译设置保存 payload：书籍级字段 + 章节级指令。
 * 书籍级字段均为可选——桌面「章节设置」弹窗只提交章节指令，
 * 手机抽屉 / 翻译设置面板提交全量书籍级字段。
 */
export type ChapterSettingsFormData = {
  preserveIndents?: boolean;
  normalizeSymbolsOnDisplay?: boolean;
  normalizeTitleOnDisplay?: boolean;
  translationChunkSize?: number;
  skipAskUser?: boolean;
  enableOriginalTextValidation?: boolean;
  taskModelOverrides?: Novel['taskModelOverrides'];
  translationInstructions?: string;
  polishInstructions?: string;
  proofreadingInstructions?: string;
};

/**
 * payload 是否携带章节级指令字段：翻译设置面板（只提交书籍级字段）保存时
 * 不得把当前选中章节的指令重置为空串。
 */
export function hasChapterInstructionPayload(data: ChapterSettingsFormData): boolean {
  return (
    data.translationInstructions !== undefined ||
    data.polishInstructions !== undefined ||
    data.proofreadingInstructions !== undefined
  );
}

/**
 * 按字段存在性构造书籍级 partial update：payload 未携带的字段绝不写入，
 * 防止「仅章节指令」保存把书籍级设置静默重置为默认值。
 */
export function buildNovelSettingsUpdate(data: ChapterSettingsFormData): Partial<Novel> {
  const updates: Partial<Novel> = {};
  if (data.preserveIndents !== undefined) updates.preserveIndents = data.preserveIndents;
  if (data.normalizeSymbolsOnDisplay !== undefined) {
    updates.normalizeSymbolsOnDisplay = data.normalizeSymbolsOnDisplay;
  }
  if (data.normalizeTitleOnDisplay !== undefined) {
    updates.normalizeTitleOnDisplay = data.normalizeTitleOnDisplay;
  }
  if (data.translationChunkSize !== undefined) {
    updates.translationChunkSize = resolveTaskChunkSize(data.translationChunkSize);
  }
  if (data.skipAskUser !== undefined) updates.skipAskUser = data.skipAskUser;
  if (data.enableOriginalTextValidation !== undefined) {
    updates.enableOriginalTextValidation = data.enableOriginalTextValidation;
  }
  if (data.taskModelOverrides !== undefined) {
    updates.taskModelOverrides = data.taskModelOverrides;
  }
  return updates;
}
