import type {
  ImportContentRef,
  ImportDraft,
  ImportDraftChapter,
  ImportNovelCandidate,
  ImportResource,
  ImportSource,
} from 'src/models/import';
import type { ImportLibraryReader } from './import-library-reader';
import { indexImportReferenceRanges, resolveImportSegments } from './import-content-references';
import type { ImportContentSegment } from './import-content-references';
import { validateImportMetadata } from './import-metadata-validation';

export type ImportBookSnapshots = Map<
  string,
  Awaited<ReturnType<typeof ImportLibraryReader.readBook>>
>;
type Extraction = Extract<ImportResource, { kind: 'extraction' }>;

export function assertImportKeys(
  value: unknown,
  allowed: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('INVALID_OPERATION: 操作包含未知字段或无效数据');
}

export function assertImportString(
  value: unknown,
  label: string,
  allowEmpty = false,
): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()))
    throw new Error(`INVALID_OPERATION: ${label}无效`);
}

function checkRef(ref: ImportContentRef): void {
  assertImportKeys(
    ref,
    ref.kind === 'extraction'
      ? ['kind', 'resourceId', 'blockId', 'endBlockId', 'start', 'end']
      : ['kind', 'bookId', 'bookRevision', 'chapterId', 'paragraphId'],
  );
  if (ref.kind !== 'extraction' && ref.kind !== 'existing')
    throw new Error('INVALID_CONTENT_REF: 未知正文引用');
}

export class ImportDraftValidator {
  private readonly resources = new Map<string, ImportResource>();
  private readonly sources = new Map<string, ImportSource>();
  private readonly candidateRanges = new WeakMap<
    ImportNovelCandidate,
    Map<string, ReturnType<typeof indexImportReferenceRanges>>
  >();
  private readonly candidateSources = new WeakMap<ImportNovelCandidate, Map<string, boolean>>();
  constructor(
    private readonly taskId: string,
    private readonly lookup: {
      resource(id: string): Promise<ImportResource | undefined>;
      source(id: string): Promise<ImportSource | undefined>;
    },
    private readonly books: ImportBookSnapshots,
  ) {}

  private async resource(id: string): Promise<ImportResource> {
    let resource = this.resources.get(id);
    if (!resource) {
      resource = await this.lookup.resource(id);
      if (!resource || resource.taskId !== this.taskId)
        throw new Error('SOURCE_SCOPE: 内容不属于当前任务');
      this.resources.set(id, resource);
    }
    return resource;
  }

  async source(id: string): Promise<ImportSource> {
    let source = this.sources.get(id);
    if (!source) {
      source = await this.lookup.source(id);
      if (!source || source.taskId !== this.taskId)
        throw new Error('SOURCE_SCOPE: 来源不属于当前任务');
      this.sources.set(id, source);
    }
    return source;
  }

  async metadata(
    draft: ImportDraft,
    field: keyof ImportDraft['metadata'],
    value: string,
    actor: 'user' | 'agent',
    sourceId?: string,
    resourceId?: string,
  ) {
    const source = sourceId ? await this.source(sourceId) : undefined;
    const resource = resourceId ? await this.resource(resourceId) : undefined;
    return validateImportMetadata(draft, field, value, actor, source, resource);
  }

  private async sourceGrant(candidate: ImportNovelCandidate, sourceId: string): Promise<boolean> {
    const visited = new Set<string>();
    let id: string | undefined = sourceId;
    while (id && !visited.has(id)) {
      if (candidate.sourceIds.includes(id)) return true;
      visited.add(id);
      id = (await this.source(id)).parentSourceId;
    }
    return false;
  }

  private async grants(
    candidate: ImportNovelCandidate,
    resource: Extraction,
    segment: ImportContentSegment,
  ): Promise<boolean> {
    if (candidate.content) {
      let cached = this.candidateRanges.get(candidate);
      if (!cached) {
        cached = new Map();
        this.candidateRanges.set(candidate, cached);
      }
      let indexed = cached.get(resource.id);
      if (!indexed) {
        indexed = indexImportReferenceRanges(resource, candidate.content);
        cached.set(resource.id, indexed);
      }
      return (indexed.get(segment.block.id) ?? []).some(
        (range) => range.start <= segment.ref.start! && range.end >= segment.ref.end!,
      );
    }
    let cached = this.candidateSources.get(candidate);
    if (!cached) {
      cached = new Map();
      this.candidateSources.set(candidate, cached);
    }
    const existing = cached.get(resource.sourceId);
    if (existing !== undefined) return existing;
    const granted = await this.sourceGrant(candidate, resource.sourceId);
    cached.set(resource.sourceId, granted);
    return granted;
  }

  private async extraction(
    ref: Extract<ImportContentRef, { kind: 'extraction' }>,
  ): Promise<{ resource: Extraction; source: ImportSource; segments: ImportContentSegment[] }> {
    const resource = await this.resource(ref.resourceId);
    if (resource.kind !== 'extraction')
      throw new Error('INVALID_CONTENT_REF: 正文引用必须来自提取结果');
    const source = await this.source(resource.sourceId);
    if (source.purpose === 'metadata-only')
      throw new Error('METADATA_ONLY: 元信息来源不能作为正文');
    if (source.status === 'excluded') throw new Error('SOURCE_SCOPE: 来源已被排除');
    return { resource, source, segments: resolveImportSegments(resource, ref) };
  }

  async candidates(candidates: ImportNovelCandidate[]): Promise<void> {
    if (
      !Array.isArray(candidates) ||
      !candidates.length ||
      candidates.length > 50 ||
      new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length
    )
      throw new Error('INVALID_OPERATION: 小说候选不能为空、重复或超过 50 本');
    for (const candidate of candidates) {
      assertImportKeys(candidate, ['id', 'title', 'author', 'sourceIds', 'content']);
      assertImportString(candidate.id, '候选 ID');
      assertImportString(candidate.title, '候选标题');
      if (candidate.title.length > 500) throw new Error('METADATA_LIMIT: 小说标题超过 500 字符');
      if (candidate.author !== undefined) assertImportString(candidate.author, '作者', true);
      if (
        !Array.isArray(candidate.sourceIds) ||
        candidate.sourceIds.some((id) => typeof id !== 'string')
      )
        throw new Error('INVALID_OPERATION: 候选来源列表无效');
      for (const id of candidate.sourceIds) {
        if ((await this.source(id)).purpose === 'metadata-only')
          throw new Error('METADATA_ONLY: 搜索结果不能授权正文');
      }
      if (candidate.content !== undefined) {
        if (!Array.isArray(candidate.content) || !candidate.content.length)
          throw new Error('INVALID_OPERATION: 候选正文范围不能为空');
        for (const ref of candidate.content) {
          checkRef(ref);
          if (ref.kind !== 'extraction')
            throw new Error('SOURCE_SCOPE: 小说候选只能声明输入来源范围');
          await this.extraction(ref);
        }
      }
    }
  }

  private selected(draft: ImportDraft): ImportNovelCandidate {
    const scope = draft.novelScope;
    const candidate = scope.candidates.find((item) => item.id === scope.selectedCandidateId);
    if (
      scope.needsChoice ||
      !candidate ||
      (scope.requiresUserChoice && scope.confirmation?.scopeRevision !== scope.revision)
    )
      throw new Error('NOVEL_CHOICE_REQUIRED: 请先确认本次处理的唯一小说');
    return candidate;
  }

  private existing(
    draft: ImportDraft,
    ref: Extract<ImportContentRef, { kind: 'existing' }>,
  ): string {
    if (draft.target.kind !== 'existing' || draft.target.bookId !== ref.bookId)
      throw new Error('TARGET_SCOPE: 既有段落不属于当前目标');
    const snapshot = this.books.get(ref.bookId);
    if (snapshot?.kind !== 'loaded') throw new Error('BOOK_READ_FAILED: 无法读取目标小说');
    if (snapshot.revision !== ref.bookRevision) throw new Error('BOOK_CHANGED: 目标小说快照已改变');
    const chapter = snapshot.chapters[ref.chapterId];
    if (chapter?.kind === 'failed') throw new Error(`BOOK_READ_FAILED: ${chapter.message}`);
    const paragraph =
      chapter?.kind === 'loaded'
        ? chapter.content.find((item) => item.id === ref.paragraphId)
        : undefined;
    if (!paragraph) throw new Error('INVALID_CONTENT_REF: 既有段落不存在');
    return paragraph.text;
  }

  async chapter(
    draft: ImportDraft,
    chapter: ImportDraftChapter,
    actor: 'user' | 'agent',
  ): Promise<ImportDraftChapter> {
    assertImportKeys(chapter, [
      'id',
      'volumeId',
      'title',
      'inferredTitle',
      'inferredStructure',
      'selected',
      'content',
      'sourceIds',
      'status',
    ]);
    for (const key of ['id', 'volumeId', 'title'] as const) assertImportString(chapter[key], key);
    if (chapter.title.length > 500) throw new Error('METADATA_LIMIT: 章节标题超过 500 字符');
    if (
      !draft.volumes.some((volume) => volume.id === chapter.volumeId) ||
      !Array.isArray(chapter.content) ||
      !Array.isArray(chapter.sourceIds) ||
      !['pending', 'ready', 'failed', 'missing'].includes(chapter.status)
    )
      throw new Error('INVALID_OPERATION: 章节归属或内容无效');
    const candidate = this.selected(draft);
    const ids = new Set<string>();
    let hasText = false;
    let titleKnown = actor === 'user';
    let structureKnown = actor === 'user';
    for (const id of chapter.sourceIds) await this.source(id);
    for (const ref of chapter.content) {
      checkRef(ref);
      if (ref.kind === 'existing') {
        hasText ||= Boolean(this.existing(draft, ref).trim());
        continue;
      }
      const { resource, source, segments } = await this.extraction(ref);
      for (const segment of segments) {
        if (!(await this.grants(candidate, resource, segment)))
          throw new Error('SOURCE_SCOPE: 该正文范围尚未归属所选小说');
        for (const other of draft.novelScope.candidates) {
          if (other.id !== candidate.id && (await this.grants(other, resource, segment)))
            throw new Error('SOURCE_SCOPE: 正文同时归属多个小说，需要细化范围');
        }
        hasText ||= Boolean(segment.text.trim());
      }
      ids.add(source.id);
      titleKnown ||=
        source.name === chapter.title ||
        resource.metadata.title === chapter.title ||
        resource.blocks.some(
          (block) =>
            block.kind === 'heading' &&
            block.text.replace(/^#{1,6}\s+/, '').trim() === chapter.title,
        );
      if (chapter.content.length === 1 && !ref.blockId && source.discoveryId) {
        const discovery = await this.resource(source.discoveryId);
        structureKnown ||=
          discovery.kind === 'discovery' && discovery.discovery.relation === 'chapter';
      }
    }
    if (chapter.status === 'ready' && !hasText)
      throw new Error('EMPTY_CONTENT: 就绪章节必须有已提取正文');
    return {
      ...chapter,
      sourceIds: [...ids],
      selected: Boolean(chapter.selected),
      inferredTitle: Boolean(chapter.inferredTitle || !titleKnown),
      inferredStructure: Boolean(chapter.inferredStructure || !structureKnown),
    };
  }
}
