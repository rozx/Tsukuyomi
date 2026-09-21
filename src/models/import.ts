import type { Novel, Paragraph } from './novel';
import type { ImportReplacementRange } from './import-matching';
import type { ChatMessage } from 'src/services/ai/types/ai-service';

/** 导入的宿主身份不属于模型工具参数，也不保存模型凭据。 */
export interface ImportRunContext {
  taskId: string;
  runId: string;
  runEpoch: number;
  modelId: string;
}

export type ImportTaskState =
  | 'draft'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'waiting_user'
  | 'failed'
  | 'ready'
  | 'applying'
  | 'applied'
  | 'reverting'
  | 'reverted';

export type ImportSourcePurpose = 'content-root' | 'content-derived' | 'metadata-only';

export interface ImportSource {
  id: string;
  taskId: string;
  name: string;
  kind: 'url' | 'file' | 'directory' | 'epub-entry';
  origin: 'user' | 'agent';
  purpose: ImportSourcePurpose;
  parentSourceId?: string;
  discoveryId?: string;
  /** 请求定位与章节锚点分开；查询参数不被丢弃。 */
  url?: string;
  anchor?: string;
  relativePath?: string;
  mediaType?: string;
  byteLength?: number;
  inputResourceId?: string;
  currentSnapshotId?: string;
  replacesSourceId?: string;
  status: 'registered' | 'inspected' | 'extracted' | 'failed' | 'excluded';
  error?: { code: string; message: string };
  createdAt: number;
}

export interface ImportDiscovery {
  id: string;
  taskId: string;
  sourceId: string;
  snapshotId?: string;
  name: string;
  kind: 'url' | 'file' | 'epub-entry';
  locator: string;
  purpose: 'content-derived' | 'metadata-only';
  relation: 'chapter' | 'catalog' | 'next' | 'file' | 'cover' | 'metadata' | 'unknown';
  inputResourceId?: string;
}

/** 块标识由快照及位置生成，相同句子也有不同标识。偏移使用 UTF-16。 */
export interface ImportTextBlock {
  id: string;
  text: string;
  start: number;
  end: number;
  kind: 'body' | 'heading' | 'preface' | 'afterword' | 'note' | 'metadata' | 'whitespace';
  locator?: string;
}

export interface ImportExtractionRules {
  preset?: string;
  selector?: string;
  excludeSelectors?: string[];
  ranges?: { start: number; end: number }[];
  excludeRanges?: { start: number; end: number; reason: string }[];
  encoding?: string;
}

interface ImportResourceBase {
  id: string;
  taskId: string;
  sourceId: string;
  createdAt: number;
}

export interface ImportInspection {
  format: 'text' | 'markdown' | 'html' | 'epub';
  kind: string;
  metadata: Record<string, string>;
  discoveryIds: string[];
  warnings: string[];
  missing: string[];
  candidates?: { title?: string; author?: string; path: string }[];
  coverResourceId?: string;
}

export type ImportResource = ImportResourceBase &
  (
    | { kind: 'input'; blob: Blob }
    | {
        kind: 'snapshot';
        blob: Blob;
        digest: string;
        text?: string;
        encoding?: string;
        requestUrl?: string;
        responseUrl?: string;
        mediaType?: string;
        transportUrl?: string;
        status?: number;
        inspection?: ImportInspection;
      }
    | {
        kind: 'extraction';
        snapshotId: string;
        rules: ImportExtractionRules;
        separator?: '' | '\n';
        blocks: ImportTextBlock[];
        excluded: { start: number; end: number; text: string; reason: string }[];
        warnings: string[];
        metadata: Record<string, string>;
      }
    | { kind: 'discovery'; discovery: ImportDiscovery }
    | {
        kind: 'directory';
        entries: {
          name: string;
          path: string;
          inputResourceId: string;
          byteLength: number;
          mediaType: string;
        }[];
      }
  );

/** 只能引用保存的原文或当前目标快照中的段落，不能传入生成的正文。 */
export type ImportContentRef =
  | {
      kind: 'extraction';
      resourceId: string;
      blockId?: string;
      endBlockId?: string;
      start?: number;
      end?: number;
    }
  | {
      kind: 'existing';
      bookId: string;
      bookRevision: number;
      chapterId: string;
      paragraphId: string;
    };

export interface ImportMetadataValue {
  value: string;
  origin: 'user' | 'source' | 'inferred';
  sourceId?: string;
  resourceId?: string;
  adopted: boolean;
}

export interface ImportDraftChapter {
  id: string;
  volumeId: string;
  title: string;
  inferredTitle: boolean;
  inferredStructure: boolean;
  selected: boolean;
  content: ImportContentRef[];
  sourceIds: string[];
  status: 'pending' | 'ready' | 'failed' | 'missing';
  /** 匹配建议与用户确认分开，工具操作只接受建议。 */
  match?: { chapterIds: string[]; basis: 'url' | 'receipt' | 'suggestion' | 'user' };
}

export interface ImportNovelCandidate {
  id: string;
  title: string;
  author?: string;
  sourceIds: string[];
  content?: ImportContentRef[];
}

export interface ImportDraft {
  revision: number;
  metadata: Partial<
    Record<'title' | 'author' | 'description' | 'cover' | 'alternateTitles', ImportMetadataValue>
  >;
  metadataCandidates?: {
    id: string;
    field: keyof ImportDraft['metadata'];
    value: ImportMetadataValue;
    scopeRevision?: number;
    conflicts?: string[];
  }[];
  replacementConsents?: { signature: string; bookId: string; bookRevision: number }[];
  chapterSettingsSources?: Record<string, { chapterId: string; bookRevision: number }>;
  volumes: { id: string; title: string; inferred: boolean }[];
  chapters: ImportDraftChapter[];
  target: { kind: 'new' } | { kind: 'existing'; bookId: string; basis: 'suggestion' | 'user' };
  targetSuggestion?: { bookId: string | null };
  novelScope: {
    revision: number;
    candidates: ImportNovelCandidate[];
    selectedCandidateId?: string;
    /** 只有宿主处理实际用户回答时写入；不在草稿工具操作的入参里。 */
    confirmation?: { questionId: string; scopeRevision: number; answeredAt: number };
    needsChoice: boolean;
    requiresUserChoice?: boolean;
    previousSelection?: Pick<ImportNovelCandidate, 'id' | 'title' | 'author'>;
  };
  completeness: { knownTotal?: number; confirmed: boolean; missing: string[] };
}

export type ImportDraftOperation =
  | {
      op: 'set_metadata';
      field: keyof ImportDraft['metadata'];
      value: string;
      sourceId?: string;
      resourceId?: string;
    }
  | { op: 'propose_target'; bookId: string | null }
  | { op: 'declare_candidates'; candidates: ImportNovelCandidate[] }
  | { op: 'upsert_volume'; id?: string; title: string; inferred?: boolean }
  | { op: 'upsert_chapter'; chapter: Omit<ImportDraftChapter, 'match'> }
  | { op: 'remove_chapter'; chapterId: string }
  | { op: 'reorder_chapters'; chapterIds: string[] }
  | { op: 'reorder_volumes'; volumeIds: string[] }
  | { op: 'propose_match'; chapterId: string; targetChapterIds: string[] }
  | { op: 'set_completeness'; completeness: ImportDraft['completeness'] };

export interface ImportDraftEdit {
  baseDraftRevision: number;
  operations: ImportDraftOperation[];
}

export interface ImportPendingQuestion {
  id: string;
  toolCallId: string;
  question: string;
  options: { id: string; label: string }[];
  kind: 'novel' | 'target' | 'match' | 'general';
  scopeRevision: number;
  draftRevision: number;
  required: boolean;
}

export interface ImportCheckpoint {
  messages: ChatMessage[];
  /** 仅包含模型已完整返回的调用。流式 JSON 片段不能进入此数组。 */
  remainingCalls: { id: string; name: string; arguments: string }[];
  completedCallIds: string[];
  summary?: string;
  deferredUserMessage?: string;
}

export interface ImportTask {
  id: string;
  name: string;
  state: ImportTaskState;
  draft: ImportDraft;
  createdAt: number;
  updatedAt: number;
  runEpoch: number;
  run?: ImportRunContext;
  eventSequence: number;
  checkpoint?: ImportCheckpoint;
  pendingQuestion?: ImportPendingQuestion;
  todos: { id: string; text: string; completed: boolean }[];
  lastError?: { code: string; message: string };
  appliedMappings?: { bookId: string; chapters: ImportPlan['mappings'] }[];
  currentPlanId?: string;
  streaming?: { text: string; reasoning?: string };
}

export interface ImportEvent {
  id: string;
  taskId: string;
  sequence: number;
  createdAt: number;
  kind: 'message' | 'tool-call' | 'tool-result' | 'progress' | 'question' | 'answer';
  message?: ChatMessage;
  callId?: string;
  toolName?: string;
  data: unknown;
}

export interface BookRevision {
  bookId: string;
  revision: number;
  operationId?: string;
}

export interface ImportParagraphChange {
  chapterId: string;
  paragraphId: string;
  kind: 'insert' | 'revise' | 'move' | 'remove' | 'retain';
  before?: string;
  after?: string;
  clearedVersions: number;
  fromChapterId?: string;
  fromParagraphId?: string;
}

export interface ImportPlan {
  id: string;
  operationId: string;
  taskId: string;
  draftRevision: number;
  targetBookId: string;
  targetKind: 'new' | 'existing';
  baseBookRevision: number;
  baseDigest: string;
  resourceIds: string[];
  book: Novel;
  chapters: { chapterId: string; content: Paragraph[] }[];
  removedChapterIds: string[];
  paragraphChanges: ImportParagraphChange[];
  metadataChanges: { field: string; before?: string; after: string; sourceId?: string }[];
  conflicts: { code: string; message: string; chapterId?: string }[];
  completeness: ImportDraft['completeness'];
  mappings: { draftChapterId: string; chapterId: string; sourceIds: string[] }[];
  replacements?: ImportReplacementRange[];
  chapterChanges?: {
    draftChapterId: string;
    chapterId: string;
    oldChapterIds: string[];
    kind: 'insert' | 'update' | 'restructure';
    title: string;
  }[];
  summary?: {
    selectedChapters: number;
    insertedParagraphs: number;
    revisedParagraphs: number;
    movedParagraphs: number;
    removedParagraphs: number;
    clearedParagraphs: number;
    clearedVersions: number;
    hasChanges: boolean;
    partial: boolean;
  };
  createdAt: number;
}

export interface ImportOperation {
  id: string;
  taskId: string;
  plan: ImportPlan;
  state: 'planned' | 'applied' | 'reverted';
  before?: {
    book: Novel | null;
    chapters: {
      chapterId: string;
      record: { content: string; lastModified: string; bookId?: string } | null;
    }[];
    target?: ImportDraft['target'];
    mappings?: ImportTask['appliedMappings'];
  };
  postApplyBookRevision?: number;
  postRevertBookRevision?: number;
  appliedAt?: number;
  revertedAt?: number;
  pendingMaintenance: string[];
}
