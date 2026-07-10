import type { Novel } from 'src/models/novel';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  resolveTaskChunkSize,
} from 'src/services/ai/tasks/utils/chunk-formatter';

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
 * 书籍级翻译设置表单状态（UI 语义：filterIndents = !preserveIndents）。
 */
export type BookSettingsFormState = {
  filterIndents: boolean;
  normalizeSymbolsOnDisplay: boolean;
  normalizeTitleOnDisplay: boolean;
  translationChunkSize: number;
  skipAskUser: boolean;
  enableOriginalTextValidation: boolean;
  translationModelOverride: string | null;
  proofreadingModelOverride: string | null;
};

const DEFAULT_FORM_STATE: BookSettingsFormState = {
  filterIndents: false,
  normalizeSymbolsOnDisplay: false,
  normalizeTitleOnDisplay: false,
  translationChunkSize: DEFAULT_TASK_CHUNK_SIZE,
  skipAskUser: false,
  enableOriginalTextValidation: false,
  translationModelOverride: null,
  proofreadingModelOverride: null,
};

/** 从书籍构造表单状态；book 为 null 时回退默认值 */
export function bookToFormState(book: Novel | null): BookSettingsFormState {
  if (!book) return { ...DEFAULT_FORM_STATE };
  return {
    filterIndents: book.preserveIndents === false,
    normalizeSymbolsOnDisplay: book.normalizeSymbolsOnDisplay === true,
    normalizeTitleOnDisplay: book.normalizeTitleOnDisplay === true,
    translationChunkSize: resolveTaskChunkSize(book.translationChunkSize),
    skipAskUser: book.skipAskUser === true,
    enableOriginalTextValidation: book.enableOriginalTextValidation === true,
    translationModelOverride: book.taskModelOverrides?.translation ?? null,
    proofreadingModelOverride: book.taskModelOverrides?.proofreading ?? null,
  };
}

/** 表单状态 → 书籍级保存 payload（不含章节指令字段） */
export function formStateToPayload(state: BookSettingsFormState): ChapterSettingsFormData {
  return {
    preserveIndents: !state.filterIndents,
    normalizeSymbolsOnDisplay: state.normalizeSymbolsOnDisplay,
    normalizeTitleOnDisplay: state.normalizeTitleOnDisplay,
    translationChunkSize: resolveTaskChunkSize(state.translationChunkSize),
    skipAskUser: state.skipAskUser,
    enableOriginalTextValidation: state.enableOriginalTextValidation,
    taskModelOverrides: {
      translation: state.translationModelOverride,
      proofreading: state.proofreadingModelOverride,
    },
  };
}

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
