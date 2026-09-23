import type { ImportDraftChapter, ImportExtractionRules } from './import';

export interface ImportChapterBatchItem {
  sourceId: string;
  snapshotId?: string;
  chapter: ImportDraftChapter;
  status: 'pending' | 'ready' | 'failed';
  contentId?: string;
  characters?: number;
  warnings?: string[];
  error?: { code: string; message: string };
}

export interface ImportChapterBatch {
  id: string;
  rules: ImportExtractionRules;
  draftRevision: number;
  scopeRevision: number;
  items: ImportChapterBatchItem[];
  runCallId?: string;
}

export interface ImportBatchProgress {
  batchId: string;
  total: number;
  ready: number;
  failed: number;
  pending: number;
}

export interface ImportBatchInput {
  base_draft_revision: number;
  volume_id: string;
  source_ids?: string[];
  discovery_ids?: string[];
  catalog?: { snapshot_id: string; offset: number; limit: number };
  rules?: ImportExtractionRules;
}
