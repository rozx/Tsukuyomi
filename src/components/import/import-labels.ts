import type { ImportDraftChapter, ImportSource, ImportTask } from 'src/models/import';
import { conciseErrorText } from 'src/services/import/import-error-text';

type Severity = 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast';

export const TASK_STATE: Record<ImportTask['state'], { label: string; severity: Severity }> = {
  draft: { label: '草稿', severity: 'secondary' },
  running: { label: '处理中', severity: 'info' },
  pausing: { label: '暂停中', severity: 'warn' },
  paused: { label: '已暂停', severity: 'secondary' },
  waiting_user: { label: '等待回答', severity: 'warn' },
  failed: { label: '处理失败', severity: 'danger' },
  ready: { label: '可预览', severity: 'success' },
  applying: { label: '应用中', severity: 'info' },
  applied: { label: '已应用', severity: 'success' },
  reverting: { label: '撤销中', severity: 'info' },
  reverted: { label: '已撤销', severity: 'secondary' },
};

export const SOURCE_STATUS: Record<ImportSource['status'], { label: string; severity: Severity }> =
  {
    registered: { label: '尚未读取', severity: 'secondary' },
    inspected: { label: '已检查', severity: 'info' },
    extracted: { label: '已提取', severity: 'success' },
    failed: { label: '处理失败', severity: 'danger' },
    excluded: { label: '已排除', severity: 'secondary' },
  };

export const SOURCE_ICON: Record<ImportSource['kind'], string> = {
  url: 'pi pi-globe',
  file: 'pi pi-file',
  directory: 'pi pi-folder',
  'epub-entry': 'pi pi-book',
};

export const CHAPTER_STATUS: Record<
  ImportDraftChapter['status'],
  { label: string; severity: Severity }
> = {
  pending: { label: '待处理', severity: 'secondary' },
  ready: { label: '已取得正文', severity: 'success' },
  failed: { label: '提取失败', severity: 'danger' },
  missing: { label: '缺失', severity: 'warn' },
};

export const METADATA_FIELDS = {
  title: '书名',
  author: '作者',
  description: '简介',
  cover: '封面',
  alternateTitles: '别名',
  tags: '标签',
} as const;

/** 多值元信息按行存储，展示时用顿号连接。 */
export function formatMetadataValue(field: keyof typeof METADATA_FIELDS, value: string): string {
  return field === 'alternateTitles' || field === 'tags'
    ? value
        .split(/\r?\n/)
        .map((text) => text.trim())
        .filter(Boolean)
        .join('、')
    : value;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 错误码前缀只用于程序判断，界面只显示简短的说明文字（旧记录中的整页错误也会被截短）。 */
export function readableError(message: string): string {
  return conciseErrorText(message.replace(/^[A-Z_]+:\s*/, ''));
}

/** 与对话相关的动作；它们的错误显示在对话区，其他错误显示在工作台状态栏。 */
export const CHAT_ERROR_ACTIONS: ReadonlySet<string> = new Set([
  'run',
  'pause',
  'compact',
  'answer',
  'choose-novel',
]);
