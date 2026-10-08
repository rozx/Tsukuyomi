/** 同步修订清单的展示分组；保留底层文件，按书籍汇总。 */
import { filenameToEntryKey } from 'src/services/sync-manifest-builder';
import {
  parseChapterGroupEntryKey,
  parseMemoriesEntryKey,
  parseNovelEntryKey,
} from 'src/models/manifest';
import { formatFileSize as formatFileSizeBase } from 'src/utils/format';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';

type RevisionText = (key: string, values?: Record<string, string | number>) => string;
const revisionText =
  (locale: AppLocale): RevisionText =>
  (key, values) =>
    translateText(locale, `syncUi.revision.${key}` as MessageKey, values);

export const formatFileSize = (bytes: number): string => formatFileSizeBase(bytes, 1);
export type RevisionFileStatus = 'added' | 'removed' | 'modified' | 'renamed';
export interface RevisionFile {
  filename: string;
  status: RevisionFileStatus;
  size?: number;
  sizeDiff?: number;
}
interface DisplayFile extends RevisionFile {
  category: string;
  displayName: string;
}
export interface GroupedRevisionFile extends RevisionFile {
  kind: 'book' | 'settings' | 'system' | 'other' | 'legacy';
  displayName: string;
  description: string;
  icon: string;
  files: DisplayFile[];
}

type FileIdentity = Pick<GroupedRevisionFile, 'filename' | 'kind' | 'displayName' | 'icon'> & {
  category: string;
};

const GLOBAL_FILES: Record<string, string> = {
  settings: 'settingsFile',
  'ai-models': 'aiModelsFile',
  'cover-history': 'coverHistoryFile',
};

function identifyFile(
  filename: string,
  titles: Map<string, string | undefined>,
  t: RevisionText,
): FileIdentity {
  // 正文分块先去掉分块序号，避免十六进制组号与数字块号混淆。
  const logicalName = filename
    .replace(/\.meta\.json$/, '.json')
    .replace(/^(v6-)?chapters-chunk-(.+)_([0-9a-f])_\d+\.json$/, '$1chapters-$2_$3.json');
  const key = filenameToEntryKey(logicalName) ?? '';
  const chapter = parseChapterGroupEntryKey(key);
  const memoryId = parseMemoriesEntryKey(key);
  const bookId = chapter?.bookId ?? memoryId ?? parseNovelEntryKey(key);
  if (bookId) {
    return {
      filename: `book:${bookId}`,
      kind: 'book',
      displayName: titles.get(bookId) || t('bookFallback', { id: bookId.slice(0, 8) }),
      icon: 'pi pi-book',
      category: filename.endsWith('.meta.json')
        ? 'metadata'
        : chapter
          ? 'chapterData'
          : memoryId
            ? 'memoryData'
            : 'bookData',
    };
  }
  const global = GLOBAL_FILES[key];
  return {
    filename: global ? 'settings' : filename,
    kind: global ? 'settings' : filename === 'manifest.json' ? 'system' : 'other',
    displayName: global
      ? t('appData')
      : filename === 'manifest.json'
        ? t('manifestFile')
        : filename,
    icon: global ? 'pi pi-cog' : 'pi pi-file',
    category: global ?? (filename === 'manifest.json' ? 'manifestFile' : 'otherFile'),
  };
}

function summarizeGroup(group: GroupedRevisionFile, t: RevisionText): GroupedRevisionFile {
  const categories = new Map<string, number>();
  for (const file of group.files) {
    categories.set(file.category, (categories.get(file.category) ?? 0) + 1);
  }
  const size = sumKnown(group.files.map((file) => (file.status === 'removed' ? 0 : file.size)));
  const sizeDiff = sumKnown(group.files.map((file) => file.sizeDiff));
  return {
    ...group,
    status: group.files.every((file) => file.status === group.status) ? group.status : 'modified',
    description:
      group.kind === 'legacy'
        ? t('legacySummary', { count: group.files.length })
        : [...categories].map(([key, count]) => `${t(key)} ${count}`).join(' · '),
    ...(size !== undefined ? { size } : {}),
    ...(sizeDiff !== undefined ? { sizeDiff } : {}),
  };
}

function sumKnown(values: Array<number | undefined>): number | undefined {
  return values.every((value) => value !== undefined)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : undefined;
}

export function getGroupedFiles(
  files: RevisionFile[],
  novels: Array<{ id: string; title?: string }>,
  locale: AppLocale = 'zh-CN',
  snapshotBookIds?: string[],
): GroupedRevisionFile[] {
  const t = revisionText(locale);
  const titles = new Map(novels.map((book) => [book.id, book.title]));
  const groups = new Map<string, GroupedRevisionFile>();
  const snapshotBooks = snapshotBookIds === undefined ? undefined : new Set(snapshotBookIds);
  for (const file of files) {
    const identity = identifyFile(file.filename, titles, t);
    if (
      identity.kind === 'book' &&
      snapshotBooks &&
      file.status !== 'removed' &&
      !snapshotBooks.has(identity.filename.slice('book:'.length))
    ) {
      identity.filename = 'legacy';
      identity.kind = 'legacy';
      identity.displayName = t('legacyFiles');
      identity.icon = 'pi pi-folder';
    }
    let group = groups.get(identity.filename);
    if (!group) {
      group = { ...identity, status: file.status, description: '', files: [] };
      groups.set(identity.filename, group);
    }
    group.files.push({
      ...file,
      ...(file.status === 'removed' && file.size !== undefined ? { sizeDiff: -file.size } : {}),
      category: identity.category,
      displayName: t(identity.category),
    });
  }
  return [...groups.values()]
    .map((group) => summarizeGroup(group, t))
    .sort((a, b) => {
      const order = { book: 0, settings: 1, system: 2, other: 3, legacy: 4 };
      return order[a.kind] - order[b.kind] || a.displayName.localeCompare(b.displayName, locale);
    });
}
