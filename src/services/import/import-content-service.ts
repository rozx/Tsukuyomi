import type { ImportNotice } from 'src/models/import-feedback';
import { importError } from './import-error';
import type {
  ImportContentRef,
  ImportResource,
  ImportSource,
  ImportTextBlock,
} from 'src/models/import';
import { ImportRepository } from './import-repository';
import { resolveImportText } from './import-content-references';

type Snapshot = Extract<ImportResource, { kind: 'snapshot' }>;
type Extraction = Extract<ImportResource, { kind: 'extraction' }>;

function checkRange(start: number, end: number, length: number): void {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > length
  ) {
    throw importError('INVALID_RANGE', 'invalidRangeTheContentRangeExceedsTheOriginal', {});
  }
}

/** 准备计算在事务外完成，由工具执行器将资源与完成回执一起保存。 */
export class ImportContentService {
  static async prepareSnapshot(
    source: ImportSource,
    blob: Blob,
    info: {
      text?: string;
      encoding?: string;
      responseUrl?: string;
      transportUrl?: string;
      status?: number;
    } = {},
  ): Promise<Snapshot> {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return {
      id: crypto.randomUUID(),
      taskId: source.taskId,
      sourceId: source.id,
      kind: 'snapshot',
      createdAt: Date.now(),
      blob,
      digest: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
      ...info,
      ...(source.url ? { requestUrl: source.url } : {}),
      ...(source.mediaType ? { mediaType: source.mediaType } : {}),
    };
  }

  static prepareExtraction(
    snapshot: Snapshot,
    result: {
      blocks: Omit<ImportTextBlock, 'id'>[];
      rules: Extraction['rules'];
      excluded: Extraction['excluded'];
      warnings: ImportNotice[];
      metadata: Record<string, string>;
      separator?: '' | '\n';
    },
  ): Extraction {
    if (
      !result.blocks.some(
        (b) => b.text.trim() && !['metadata', 'heading', 'whitespace'].includes(b.kind),
      )
    ) {
      throw importError('EMPTY_CONTENT', 'emptyContentNoBodyTextWasExtractedAdjust', {});
    }
    if (snapshot.text === undefined)
      throw importError('UNDECODED_SOURCE', 'undecodedSourceDecodeTheSourceFirst', {});
    for (const block of [...result.blocks, ...result.excluded])
      checkRange(block.start, block.end, snapshot.text.length);
    return {
      rules: result.rules,
      excluded: result.excluded,
      warnings: result.warnings,
      metadata: result.metadata,
      ...(result.separator !== undefined ? { separator: result.separator } : {}),
      id: crypto.randomUUID(),
      kind: 'extraction',
      taskId: snapshot.taskId,
      sourceId: snapshot.sourceId,
      snapshotId: snapshot.id,
      createdAt: Date.now(),
      blocks: result.blocks.map((block, index) => ({
        ...block,
        id: `${snapshot.id}:${block.start}:${block.end}:${index}`,
      })),
    };
  }

  static async read(
    taskId: string,
    resourceId: string,
    options: { offset?: number; limit?: number } = {},
  ): Promise<{ text: string; offset: number; total: number; nextOffset?: number }> {
    const resource = await ImportRepository.getResource(taskId, resourceId);
    const text =
      resource?.kind === 'snapshot'
        ? resource.text
        : resource?.kind === 'extraction'
          ? resource.blocks.map((b) => b.text).join(resource.separator ?? '\n')
          : undefined;
    if (text === undefined)
      throw importError(
        'UNREADABLE_RESOURCE',
        'unreadableResourceTheResourceHasNoReadableText',
        {},
      );
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 4000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 16000)
      throw importError('INVALID_PAGE', 'invalidPageReadAtMostCharactersAtA', {});
    checkRange(offset, offset, text.length);
    const end = Math.min(offset + limit, text.length);
    return {
      text: text.slice(offset, end),
      offset,
      total: text.length,
      ...(end < text.length ? { nextOffset: end } : {}),
    };
  }

  static async resolve(
    taskId: string,
    ref: Extract<ImportContentRef, { kind: 'extraction' }>,
  ): Promise<string> {
    const resource = await ImportRepository.getResource(taskId, ref.resourceId);
    if (resource?.kind !== 'extraction')
      throw importError('INVALID_CONTENT_REF', 'invalidContentRefTheBodyReferenceIsNotAn', {});
    const source = await ImportRepository.getSource(taskId, resource.sourceId);
    if (source.purpose === 'metadata-only')
      throw importError('METADATA_ONLY', 'metadataOnlyMetadataSourcesCannotBeNovelContent', {});
    return resolveImportText(resource, ref);
  }
}
