import type { ImportDraft, ImportDraftChapter } from './import';
import type { ImportTextPattern } from './import-pattern';

export interface ImportDraftBatchInput {
  base_draft_revision: number;
  target: 'body' | 'chapter_title' | 'volume_title';
  scope: {
    chapter_ids?: string[];
    volume_ids?: string[];
    selected_only?: boolean;
    title?: ImportTextPattern;
  };
  pattern: ImportTextPattern;
  action: 'remove_matches' | 'remove_lines' | 'replace';
  replacement?: string;
}
export interface ImportDraftBatchSummary {
  success: true;
  batchId: string;
  draftRevision: number;
  affected: number;
  matches: number;
  examples: { id: string; before: string; after: string }[];
}
export interface ImportDraftBatch {
  input: ImportDraftBatchInput;
  chapters: ImportDraftChapter[];
  volumes: ImportDraft['volumes'];
  summary: ImportDraftBatchSummary;
  appliedRevision?: number;
}
