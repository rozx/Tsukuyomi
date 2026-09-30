import { readImportError, importError } from './import-error';

import type { ImportTransaction } from './import-repository';
import { excludeImportText } from './import-content-exclusions';
import type {
  ImportContentRef,
  ImportDraft,
  ImportDraftChapter,
  ImportNovelCandidate,
  ImportResource,
  ImportSource,
} from 'src/models/import';
import type { ImportLibraryReader } from './import-library-reader';
import {
  indexImportReferenceRanges,
  resolveImportSegments,
  resolveImportText,
} from './import-content-references';
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
    throw importError(
      'INVALID_OPERATION',
      'invalidOperationTheOperationContainsUnknownFieldsOr',
      {},
    );
}

export function assertImportString(
  value: unknown,
  label: string,
  allowEmpty = false,
): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()))
    throw importError('INVALID_OPERATION', 'invalidOperationInvalidDetail', {
      value1: String(label),
    });
}

function checkRef(ref: ImportContentRef): void {
  assertImportKeys(
    ref,
    ref.kind === 'extraction'
      ? ['kind', 'resourceId', 'blockId', 'endBlockId', 'start', 'end', 'excludeRanges']
      : ['kind', 'bookId', 'bookRevision', 'chapterId', 'paragraphId', 'excludeRanges'],
  );
  if (ref.kind !== 'extraction' && ref.kind !== 'existing')
    throw importError('INVALID_CONTENT_REF', 'invalidContentRefUnknownBodyReference', {});
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
        throw importError('SOURCE_SCOPE', 'sourceScopeTheContentBelongsToAnotherTask', {});
      this.resources.set(id, resource);
    }
    return resource;
  }

  async source(id: string): Promise<ImportSource> {
    let source = this.sources.get(id);
    if (!source) {
      source = await this.lookup.source(id);
      if (!source || source.taskId !== this.taskId)
        throw importError('SOURCE_SCOPE', 'sourceScopeTheSourceBelongsToAnotherTask', {});
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

  /** 批次只接收整章来源；按正文片段划分的作品仍由范围编辑处理。 */
  async batchSource(draft: ImportDraft, sourceId: string): Promise<ImportSource> {
    const source = await this.source(sourceId);
    if (source.removedAt !== undefined)
      throw importError('SOURCE_REMOVED', 'sourceRemovedTheUserRemovedABatchSource', {});
    const candidate = this.selected(draft);
    if (source.purpose === 'metadata-only')
      throw importError('METADATA_ONLY', 'metadataOnlyMetadataSourcesCannotBeBodyText', {});
    if (source.status === 'excluded' || source.kind === 'directory')
      throw importError('SOURCE_SCOPE', 'sourceScopeTheSourceIsExcludedOrIs', {});
    if (candidate.content || !(await this.sourceGrant(candidate, source.id)))
      throw importError('SOURCE_SCOPE', 'sourceScopeBatchSourcesAreNotFullyAssigned', {});
    for (const other of draft.novelScope.candidates) {
      if (other.id !== candidate.id && (await this.sourceGrant(other, source.id)))
        throw importError('SOURCE_SCOPE', 'sourceScopeBatchSourcesMayBelongToSeveral', {});
    }
    return source;
  }

  private async extraction(
    ref: Extract<ImportContentRef, { kind: 'extraction' }>,
  ): Promise<{ resource: Extraction; source: ImportSource; segments: ImportContentSegment[] }> {
    const resource = await this.resource(ref.resourceId);
    if (resource.kind !== 'extraction')
      throw importError(
        'INVALID_CONTENT_REF',
        'invalidContentRefBodyReferencesMustUseExtractionResults',
        {},
      );
    const source = await this.source(resource.sourceId);
    if (source.purpose === 'metadata-only')
      throw importError('METADATA_ONLY', 'metadataOnlyMetadataSourcesCannotBeBodyText', {});
    if (source.status === 'excluded')
      throw importError('SOURCE_SCOPE', 'sourceScopeTheSourceIsExcluded', {});
    return { resource, source, segments: resolveImportSegments(resource, ref) };
  }

  async candidates(candidates: ImportNovelCandidate[]): Promise<void> {
    if (
      !Array.isArray(candidates) ||
      !candidates.length ||
      candidates.length > 50 ||
      new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length
    )
      throw importError(
        'INVALID_OPERATION',
        'invalidOperationNovelCandidatesMustBeNonemptyDistinct',
        {},
      );
    for (const candidate of candidates) {
      assertImportKeys(candidate, ['id', 'title', 'author', 'sourceIds', 'content']);
      assertImportString(candidate.id, 'candidate.id');
      assertImportString(candidate.title, 'candidate.title');
      if (candidate.title.length > 500)
        throw importError('METADATA_LIMIT', 'metadataLimitNovelTitlesAreLimitedToCharacters', {});
      if (candidate.author !== undefined)
        assertImportString(candidate.author, 'candidate.author', true);
      if (
        !Array.isArray(candidate.sourceIds) ||
        candidate.sourceIds.some((id) => typeof id !== 'string')
      )
        throw importError('INVALID_OPERATION', 'invalidOperationInvalidCandidateSourceList', {});
      for (const id of candidate.sourceIds) {
        if ((await this.source(id)).purpose === 'metadata-only')
          throw importError(
            'METADATA_ONLY',
            'metadataOnlySearchResultsCannotAuthorizeNovelBody',
            {},
          );
      }
      if (candidate.content !== undefined) {
        if (!Array.isArray(candidate.content) || !candidate.content.length)
          throw importError(
            'INVALID_OPERATION',
            'invalidOperationCandidateBodyRangesMustBeNonempty',
            {},
          );
        for (const ref of candidate.content) {
          checkRef(ref);
          if (ref.kind !== 'extraction' || ref.excludeRanges?.length)
            throw importError(
              'SOURCE_SCOPE',
              'sourceScopeNovelCandidatesCanOnlyDeclareAuthorized',
              {},
            );
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
      throw importError(
        'NOVEL_CHOICE_REQUIRED',
        'novelChoiceRequiredConfirmTheSingleNovelForThis',
        {},
      );
    return candidate;
  }

  private existing(
    draft: ImportDraft,
    ref: Extract<ImportContentRef, { kind: 'existing' }>,
  ): string {
    if (draft.target.kind !== 'existing' || draft.target.bookId !== ref.bookId)
      throw importError('TARGET_SCOPE', 'targetScopeTheExistingParagraphBelongsToAnother', {});
    const snapshot = this.books.get(ref.bookId);
    if (snapshot?.kind !== 'loaded')
      throw importError('BOOK_READ_FAILED', 'bookReadFailedCannotReadTheTargetNovel', {});
    if (snapshot.revision !== ref.bookRevision)
      throw importError('BOOK_CHANGED', 'bookChangedTheTargetNovelSnapshotChanged', {});
    const chapter = snapshot.chapters[ref.chapterId];
    if (chapter?.kind === 'failed')
      throw importError('BOOK_READ_FAILED', 'bookReadFailedDetail', {
        value1: readImportError(chapter),
      });
    const paragraph =
      chapter?.kind === 'loaded'
        ? chapter.content.find((item) => item.id === ref.paragraphId)
        : undefined;
    if (!paragraph)
      throw importError(
        'INVALID_CONTENT_REF',
        'invalidContentRefTheExistingParagraphDoesNotExist',
        {},
      );
    return excludeImportText(paragraph.text, ref.excludeRanges);
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
    if (chapter.title.length > 500)
      throw importError('METADATA_LIMIT', 'metadataLimitChapterTitlesAreLimitedToCharacters', {});
    if (
      !draft.volumes.some((volume) => volume.id === chapter.volumeId) ||
      !Array.isArray(chapter.content) ||
      !Array.isArray(chapter.sourceIds) ||
      !['pending', 'ready', 'failed', 'missing'].includes(chapter.status)
    )
      throw importError('INVALID_OPERATION', 'invalidOperationInvalidChapterVolumeOrContent', {});
    const candidate = this.selected(draft);
    const ids = new Set<string>();
    let hasText = false;
    let titleKnown = actor === 'user';
    let structureKnown = actor === 'user';
    for (const id of chapter.sourceIds) await this.source(id);
    for (const ref of chapter.content) {
      checkRef(ref);
      if (ref.kind === 'existing') {
        const existingText = this.existing(draft, ref);
        hasText ||= Boolean(existingText.trim());
        continue;
      }
      const { resource, source, segments } = await this.extraction(ref);
      for (const segment of segments) {
        if (!(await this.grants(candidate, resource, segment)))
          throw importError('SOURCE_SCOPE', 'sourceScopeThisBodyRangeHasNotBeen', {});
        for (const other of draft.novelScope.candidates) {
          if (other.id !== candidate.id && (await this.grants(other, resource, segment)))
            throw importError('SOURCE_SCOPE', 'sourceScopeTheBodyBelongsToSeveralNovels', {});
        }
      }
      const filteredText = resolveImportText(resource, ref);
      hasText ||= Boolean(filteredText.trim());
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
      throw importError('EMPTY_CONTENT', 'emptyContentReadyChaptersRequireExtractedBodyText', {});
    return {
      ...chapter,
      sourceIds: [...ids],
      selected: Boolean(chapter.selected),
      inferredTitle: Boolean(chapter.inferredTitle || !titleKnown),
      inferredStructure: Boolean(chapter.inferredStructure || !structureKnown),
    };
  }
}

export function importTransactionValidator(
  taskId: string,
  tx: ImportTransaction,
  books: ImportBookSnapshots = new Map(),
): ImportDraftValidator {
  return new ImportDraftValidator(
    taskId,
    {
      resource: (id) => tx.objectStore('import-resources').get(id),
      source: (id) => tx.objectStore('import-sources').get(id),
    },
    books,
  );
}
