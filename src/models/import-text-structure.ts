import type { ImportDraft, ImportDraftChapter } from './import';
import type { ImportTextPattern, ImportTextRange } from './import-pattern';

export interface ImportStructureRules {
  mode: 'single' | 'regex' | 'markdown';
  chapter_pattern?: ImportTextPattern;
  volume_pattern?: ImportTextPattern;
  chapter_level?: number;
  volume_level?: number;
  include_headings?: boolean;
  selection?: { start?: ImportTextPattern; end?: ImportTextPattern; body?: ImportTextPattern };
}
export interface ImportStructureInput {
  resource_id: string;
  base_draft_revision: number;
  rules: ImportStructureRules;
  volume_id?: string;
  replace_chapter_ids?: string[];
}
export interface ImportStructureChapter extends ImportTextRange {
  bodyStart: number;
  title: string;
  volumeIndex: number;
  unassigned: boolean;
  warnings: string[];
}
export interface ImportStructureResult {
  volumes: { title: string; inferred: boolean }[];
  chapters: ImportStructureChapter[];
  excluded: (ImportTextRange & { reason: string })[];
  selected: ImportTextRange;
}
export interface ImportStructureJob {
  kind: 'structure';
  text: string;
  format: 'text' | 'markdown';
  rules: ImportStructureRules;
}
export interface ImportStructureItem extends ImportStructureChapter {
  chapterId: string;
  volumeTitle: string;
  characters: number;
  head: string;
  tail: string;
}
export interface ImportStructureSummary {
  success: true;
  batchId: string;
  resourceId: string;
  sourceId: string;
  sourceName: string;
  snapshotId: string;
  draftRevision: number;
  chapters: number;
  volumes: number;
  unassigned: number;
  empty: number;
  warningCount: number;
  selected: ImportTextRange;
  totalCharacters: number;
  excludedCharacters: number;
  examples: ImportStructureItem[];
  applied?: boolean;
}
export interface ImportTextStructureBatch {
  input: ImportStructureInput;
  summary: ImportStructureSummary;
  chapters: ImportDraftChapter[];
  volumes: ImportDraft['volumes'];
  items: ImportStructureItem[];
  excluded: ImportStructureResult['excluded'];
  appliedRevision?: number;
}
