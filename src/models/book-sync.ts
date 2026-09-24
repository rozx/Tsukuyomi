import type { ImportExtractionRules, ImportParagraphChange } from './import';
import type { ImportSourceFilter, ImportTextPattern } from './import-pattern';
import type { CoverImage, Paragraph } from './novel';

export interface BookUpdateRecipe {
  version: 1;
  engine:
    | {
        kind: 'builtin';
        site: 'syosetu-org' | 'kakuyomu' | 'ncode' | 'novel18';
        content?: ImportExtractionRules;
      }
    | {
        kind: 'html';
        content: ImportExtractionRules;
        catalogSelector?: string;
        chapterFilter?: ImportSourceFilter;
        followNext?: boolean;
      };
  catalogUrls: string[];
  cleanup?: { pattern: ImportTextPattern; action: 'remove_matches' | 'remove_lines' }[];
  stripHeading?: boolean;
  skippedUrls?: { url: string; title: string }[];
  pinnedUrls?: string[];
  verifiedChapterCount: number;
  recordedAt: number;
}

export interface CatalogEntry {
  url: string;
  title: string;
  group?: string;
  lastUpdated?: Date;
}

export interface SyncCatalog {
  meta: {
    title: string;
    author?: string;
    description?: string;
    tags?: string[];
    cover?: CoverImage;
  };
  entries: CatalogEntry[];
}

export type SyncVolumeTarget = { volumeId: string } | { newTitle: string };
export interface SyncNewChapter extends CatalogEntry {
  target: SyncVolumeTarget;
  groupKey: string;
}
export interface SyncUpdatedChapter extends CatalogEntry {
  chapterId: string;
  paragraphs: Paragraph[];
  changes: ImportParagraphChange[];
  revised: number;
  inserted: number;
  removed: number;
  clearedVersions: number;
}
export interface SyncFailure {
  url: string;
  code: string;
  message: string;
}
export interface BookSyncChangeset {
  baseRevision: number | null;
  new: SyncNewChapter[];
  updated: SyncUpdatedChapter[];
  skipped: CatalogEntry[];
  failed: SyncFailure[];
  unchecked: string[];
  /** 已完成比对的已导入章节（含未变化的），与 unchecked 互补，用于判断大面积差异 */
  checked: string[];
  /** unchecked 的子集：内置站点目录给出的更新日期没有变新，快速检查据此认为无变化 */
  dateUnchanged: string[];
  status: 'unchecked' | 'ready' | 'cancelled' | 'invalid';
}

export interface BookSyncSelection {
  urls: string[];
  volumeOverrides?: Map<string, SyncVolumeTarget>;
}
export interface BookSyncApplyResult {
  bookId: string;
  revision: number;
  status: 'success' | 'partial' | 'failed';
  appliedUrls: string[];
  failed: SyncFailure[];
  cover?: CoverImage;
}
