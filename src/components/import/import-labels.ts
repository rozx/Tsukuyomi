import type { ImportDraftChapter, ImportSource, ImportTask } from 'src/models/import';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';
import { conciseErrorText } from 'src/services/import/import-error-text';
import { importNoticeText } from 'src/services/import/import-error';

type Severity = 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast';

export const TASK_STATE: Record<ImportTask['state'], { label: MessageKey; severity: Severity }> = {
  draft: { label: 'importUi.taskState.draft', severity: 'secondary' },
  running: { label: 'importUi.taskState.running', severity: 'info' },
  pausing: { label: 'importUi.taskState.pausing', severity: 'warn' },
  paused: { label: 'importUi.taskState.paused', severity: 'secondary' },
  waiting_user: { label: 'importUi.taskState.waitingUser', severity: 'warn' },
  failed: { label: 'importUi.taskState.failed', severity: 'danger' },
  ready: { label: 'importUi.taskState.ready', severity: 'success' },
  applying: { label: 'importUi.taskState.applying', severity: 'info' },
  applied: { label: 'importUi.taskState.applied', severity: 'success' },
  reverting: { label: 'importUi.taskState.reverting', severity: 'info' },
  reverted: { label: 'importUi.taskState.reverted', severity: 'secondary' },
};

export const SOURCE_STATUS: Record<
  ImportSource['status'],
  { label: MessageKey; severity: Severity }
> = {
  registered: { label: 'importUi.sourceStatus.registered', severity: 'secondary' },
  inspected: { label: 'importUi.sourceStatus.inspected', severity: 'info' },
  extracted: { label: 'importUi.sourceStatus.extracted', severity: 'success' },
  failed: { label: 'importUi.sourceStatus.failed', severity: 'danger' },
  excluded: { label: 'importUi.sourceStatus.excluded', severity: 'secondary' },
};

export const SOURCE_ICON: Record<ImportSource['kind'], string> = {
  url: 'pi pi-globe',
  file: 'pi pi-file',
  directory: 'pi pi-folder',
  'epub-entry': 'pi pi-book',
};

export const CHAPTER_STATUS: Record<
  ImportDraftChapter['status'],
  { label: MessageKey; severity: Severity }
> = {
  pending: { label: 'importUi.chapterStatus.pending', severity: 'secondary' },
  ready: { label: 'importUi.chapterStatus.ready', severity: 'success' },
  failed: { label: 'importUi.chapterStatus.failed', severity: 'danger' },
  missing: { label: 'importUi.chapterStatus.missing', severity: 'warn' },
};

export const METADATA_FIELDS: Record<
  'title' | 'author' | 'description' | 'cover' | 'alternateTitles' | 'tags',
  MessageKey
> = {
  title: 'importUi.metadata.title',
  author: 'importUi.metadata.author',
  description: 'importUi.metadata.description',
  cover: 'importUi.metadata.cover',
  alternateTitles: 'importUi.metadata.alternateTitles',
  tags: 'importUi.metadata.tags',
};

/** 多值元信息按行存储，展示时按界面语言的列举分隔符连接（简中为顿号）。 */
export function formatMetadataValue(
  field: keyof typeof METADATA_FIELDS,
  value: string,
  locale: AppLocale = 'zh-CN',
): string {
  return field === 'alternateTitles' || field === 'tags'
    ? value
        .split(/\r?\n/)
        .map((text) => text.trim())
        .filter(Boolean)
        .join(translateText(locale, 'importUi.listSeparator'))
    : value;
}

export function formatTime(timestamp: number, locale: AppLocale = 'zh-CN'): string {
  return new Date(timestamp).toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 错误码前缀只用于程序判断，界面只显示简短的说明文字（旧记录中的整页错误也会被截短）。
 * 带身份的自有说明按界面语言重新投影；旧记录的纯文字和外部诊断保持原文。
 */
export function readableError(value: unknown, locale: AppLocale = 'zh-CN'): string {
  const message = importNoticeText(value, locale);
  return conciseErrorText(message.replace(/^[A-Z_]+:\s*/, ''), locale);
}

/** 与对话相关的动作；它们的错误显示在对话区，其他错误显示在工作台状态栏。 */
export const CHAT_ERROR_ACTIONS: ReadonlySet<string> = new Set([
  'run',
  'pause',
  'compact',
  'answer',
  'choose-novel',
]);
