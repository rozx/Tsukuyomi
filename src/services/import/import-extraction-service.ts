import type {
  ImportDiscovery,
  ImportExtractionRules,
  ImportInspection,
  ImportResource,
  ImportSource,
} from 'src/models/import';
import { ImportRepository } from './import-repository';
import { ImportSourceService } from './import-source-service';
import { ImportContentService } from './import-content-service';
import { ImportParsingClient } from './import-parsing-client';
import { IMPORT_PARSE_LIMITS } from './import-work-limits';
import { NovelScraperFactory } from 'src/services/scraper/novel-scraper-factory';
import { fetchScraperPage } from 'src/services/scraper/core/page-transport';
import { isCancelledError } from 'src/utils/is-cancelled-error';
import { FirecrawlQuotaError } from 'src/services/firecrawl/firecrawl-errors';
import type { ImportParsedContent } from 'src/models/import-parsing';

type Snapshot = Extract<ImportResource, { kind: 'snapshot' }>;
interface SourceResult {
  success: boolean;
  sourceId: string;
  snapshotId?: string;
  contentId?: string;
  format?: ImportInspection['format'] | 'directory';
  kind?: string;
  metadata?: Record<string, string>;
  discoveries?: ImportDiscovery[];
  nextOffset?: number;
  totalDiscoveries?: number;
  preview?: string;
  totalCharacters?: number;
  warnings?: string[];
  missing?: string[];
  candidates?: ImportInspection['candidates'];
  coverResourceId?: string;
  error?: { code: string; message: string };
}
interface Prepared {
  resources: ImportResource[];
  sources: ImportSource[];
  result: SourceResult;
}
interface InspectionOptions {
  refresh?: boolean;
  snapshotId?: string;
  encoding?: string;
  signal?: AbortSignal;
  offset?: number;
  limit?: number;
}

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('操作已取消', 'AbortError');
}

/** Firecrawl 额度耗尽：章节批次据此停止领取剩余章节 */
export const FIRECRAWL_QUOTA_ERROR_CODE = 'FIRECRAWL_QUOTA';

function errorResult(sourceId: string, error: unknown): SourceResult {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof FirecrawlQuotaError
      ? FIRECRAWL_QUOTA_ERROR_CODE
      : (/^([A-Z_]+):/.exec(message)?.[1] ?? 'SOURCE_FAILED');
  return { success: false, sourceId, error: { code, message } };
}

function formatOf(
  source: ImportSource,
  bytes: Uint8Array,
  text?: string,
): ImportInspection['format'] {
  if (
    /\.epub$/i.test(source.name) ||
    source.mediaType === 'application/epub+zip' ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4)
  )
    return 'epub';
  if (
    /\.x?html?$/i.test(source.name) ||
    /html/.test(source.mediaType ?? '') ||
    /^\s*(?:<!doctype\s+html|<\?xml|<html|<body|<article|<main|<div|<p[\s>])/i.test(text ?? '')
  )
    return 'html';
  return /\.(?:md|markdown)$/i.test(source.name) || /^#{1,6}\s/m.test(text ?? '')
    ? 'markdown'
    : 'text';
}

function cleanSource(source: ImportSource): ImportSource {
  const { error: _error, ...clean } = source;
  return clean;
}

function enrichSiteInspection(
  source: ImportSource,
  snapshot: Snapshot,
  parsed: ImportParsedContent,
): void {
  if (!source.url || snapshot.text === undefined) return;
  const adapter = NovelScraperFactory.getScraper(source.url);
  if (!adapter) return;
  try {
    const page = adapter.parseNovelSnapshot(snapshot.text, snapshot.responseUrl ?? source.url);
    for (const field of ['title', 'author', 'description', 'cover'] as const) {
      const value = page.info[field];
      if (value && !(field === 'cover' && parsed.metadata.cover)) parsed.metadata[field] = value;
    }
    // 多值字段与草稿元信息一致，按行存储
    if (page.info.tags?.length) parsed.metadata.tags = page.info.tags.join('\n');
    const observed = new Map(parsed.links.map((link) => [link.href, link]));
    for (const chapter of page.info.chapters)
      observed.set(chapter.url, { name: chapter.title, href: chapter.url, relation: 'chapter' });
    for (const next of page.nextPageUrls)
      observed.set(next, { name: '下一页', href: next, relation: 'next' });
    parsed.links = [...observed.values()];
    if (page.info.chapters.length) {
      let hasBody = false;
      try {
        hasBody = Boolean(adapter.parseChapterSnapshot(snapshot.text).text.trim());
      } catch {
        /* 目录页没有正文容器是正常情况。 */
      }
      if (!hasBody) parsed.kind = 'catalog';
    }
  } catch {
    /* 站点规则未命中时仍保留通用检查和 CSS 提取入口。 */
  }
}

/** 只准备步骤；执行器必须将这些资源与工具结果、检查点一起交给 saveStep。 */
export class ImportExtractionService {
  constructor(private readonly parser = new ImportParsingClient()) {}

  private async cachedSnapshot(
    source: ImportSource,
    options: InspectionOptions,
  ): Promise<Snapshot | undefined> {
    const snapshotId =
      options.snapshotId ?? (!options.refresh ? source.currentSnapshotId : undefined);
    if (snapshotId) {
      const stored = await ImportRepository.getResource(source.taskId, snapshotId);
      if (options.snapshotId && (stored?.kind !== 'snapshot' || stored.sourceId !== source.id))
        throw new Error('SOURCE_SCOPE: 快照不属于当前来源');
      const encoding = options.encoding ? new TextDecoder(options.encoding).encoding : undefined;
      if (
        stored?.kind === 'snapshot' &&
        stored.sourceId === source.id &&
        (!encoding || stored.encoding === encoding)
      )
        return stored.inspection
          ? stored
          : { ...stored, id: crypto.randomUUID(), createdAt: Date.now() };
    }
    return undefined;
  }

  private async readSnapshot(source: ImportSource, options: InspectionOptions): Promise<Snapshot> {
    if (source.kind === 'url' && options.encoding)
      throw new Error('INVALID_ENCODING: 网页已由现有请求层解码，字节编码仅适用于文件');
    const cached = await this.cachedSnapshot(source, options);
    if (cached) return cached;
    if (source.kind === 'url' && source.url) {
      const adapter = NovelScraperFactory.getScraper(source.url);
      const response = adapter
        ? await adapter.fetchPageSnapshot(source.url, options.signal)
        : await fetchScraperPage(source.url, options.signal ? { signal: options.signal } : {});
      ensureActive(options.signal);
      if (response.html.length > IMPORT_PARSE_LIMITS.textCharacters)
        throw new Error('PROCESSING_LIMIT: 网页超过文本上限');
      return ImportContentService.prepareSnapshot(
        source,
        new Blob([response.html], { type: 'text/html' }),
        {
          text: response.html,
          transportUrl: response.transportUrl,
          status: response.status,
          ...(response.responseUrl ? { responseUrl: response.responseUrl } : {}),
        },
      );
    }
    const input =
      source.inputResourceId &&
      (await ImportRepository.getResource(source.taskId, source.inputResourceId));
    if (!input || input.kind !== 'input')
      throw new Error('SOURCE_UNAVAILABLE: 文件未保存，请重新提供');
    if (input.blob.size > IMPORT_PARSE_LIMITS.inputBytes)
      throw new Error('PROCESSING_LIMIT: 文件超过输入上限');
    const bytes = new Uint8Array(await input.blob.arrayBuffer());
    ensureActive(options.signal);
    if (formatOf(source, bytes) === 'epub')
      return ImportContentService.prepareSnapshot(source, input.blob);
    if (new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-')
      throw new Error('UNSUPPORTED_FORMAT: 当前没有 PDF 正文解析能力，请提供可读文本');
    const decoded = (
      await this.parser.run(
        { kind: 'decode', bytes, ...(options.encoding ? { encoding: options.encoding } : {}) },
        options,
      )
    ).value;
    return ImportContentService.prepareSnapshot(source, input.blob, {
      text: decoded.text,
      encoding: decoded.encoding,
    });
  }

  private async inspectEpub(
    source: ImportSource,
    snapshot: Snapshot,
    signal?: AbortSignal,
  ): Promise<ImportResource[]> {
    const bytes = new Uint8Array(await snapshot.blob.arrayBuffer());
    const epub = (await this.parser.run({ kind: 'epub', bytes }, signal ? { signal } : {})).value;
    const inputs: ImportResource[] = [];
    const entries = epub.entries.map((entry) => {
      const id = crypto.randomUUID();
      inputs.push({
        id,
        taskId: source.taskId,
        sourceId: source.id,
        kind: 'input',
        blob: new Blob([entry.bytes.slice().buffer], { type: entry.mediaType }),
        createdAt: Date.now(),
      });
      return {
        name: entry.title || entry.path,
        kind: 'epub-entry' as const,
        locator: entry.path,
        relation:
          entry.kind === 'content'
            ? ('chapter' as const)
            : entry.kind === 'catalog'
              ? ('catalog' as const)
              : entry.kind === 'cover'
                ? ('cover' as const)
                : ('metadata' as const),
        inputResourceId: id,
      };
    });
    const discovered = await ImportSourceService.prepareDiscoveries(
      source.taskId,
      source.id,
      entries,
      { resources: inputs, snapshotId: snapshot.id },
    );
    const cover = entries.find((entry) => entry.locator === epub.coverPath);
    snapshot.inspection = {
      format: 'epub',
      kind: 'catalog',
      metadata: epub.metadata,
      discoveryIds: discovered.discoveries.map((entry) => entry.id),
      warnings: epub.warnings,
      missing: epub.missingEntries,
      candidates: epub.packages,
      ...(cover ? { coverResourceId: cover.inputResourceId } : {}),
    };
    return [...inputs, ...discovered.resources];
  }

  private async inspectText(
    source: ImportSource,
    snapshot: Snapshot,
    signal?: AbortSignal,
  ): Promise<ImportResource[]> {
    const format =
      source.kind === 'url' ? 'html' : formatOf(source, new Uint8Array(), snapshot.text);
    if (format === 'epub') throw new Error('EPUB_STRUCTURE: EPUB 快照未正确解包');
    const baseUrl = snapshot.responseUrl ?? source.url;
    const parsed = (
      await this.parser.run(
        { kind: 'content', format, text: snapshot.text ?? '', ...(baseUrl ? { baseUrl } : {}) },
        signal ? { signal } : {},
      )
    ).value;
    enrichSiteInspection(source, snapshot, parsed);
    const observed =
      source.kind === 'url'
        ? parsed.links.map((link) => ({
            name: link.name,
            kind: 'url' as const,
            locator: link.href,
            relation: link.relation,
          }))
        : [];
    const discovered = await ImportSourceService.prepareDiscoveries(
      source.taskId,
      source.id,
      observed,
      { snapshotId: snapshot.id },
    );
    snapshot.inspection = {
      format,
      kind: parsed.kind,
      metadata: parsed.metadata,
      discoveryIds: discovered.discoveries.map((entry) => entry.id),
      warnings: parsed.warnings,
      missing: [],
    };
    return discovered.resources;
  }

  private async inspectionResult(
    source: ImportSource,
    snapshot: Snapshot,
    resources: ImportResource[],
    options: InspectionOptions,
  ): Promise<SourceResult> {
    const inspection = snapshot.inspection!;
    const { discoveryIds: _discoveryIds, ...details } = inspection;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('INVALID_PAGE: 来源检查分页无效');
    const discoveries: ImportDiscovery[] = [];
    for (const id of inspection.discoveryIds.slice(offset, offset + limit)) {
      const resource =
        resources.find((entry) => entry.id === id) ??
        (await ImportRepository.getResource(source.taskId, id));
      if (resource?.kind === 'discovery') discoveries.push(resource.discovery);
    }
    const unavailable = ['verification', 'dynamic'].includes(inspection.kind);
    return {
      success: !unavailable,
      sourceId: source.id,
      snapshotId: snapshot.id,
      ...details,
      discoveries,
      totalDiscoveries: inspection.discoveryIds.length,
      ...(offset + limit < inspection.discoveryIds.length ? { nextOffset: offset + limit } : {}),
      preview: snapshot.text?.slice(0, 4000) ?? '',
      totalCharacters: snapshot.text?.length ?? 0,
      ...(unavailable
        ? {
            error: {
              code: 'SOURCE_UNAVAILABLE',
              message: '未取得小说正文：来源为登录、验证页或动态空壳，可在本任务补充文件。',
            },
          }
        : {}),
    };
  }

  async prepareInspection(
    taskId: string,
    sourceId: string,
    options: InspectionOptions = {},
  ): Promise<Prepared> {
    ensureActive(options.signal);
    const source = await ImportRepository.getActiveSource(taskId, sourceId);
    const resources: ImportResource[] = [];
    try {
      const snapshot = await this.readSnapshot(source, options);
      if (!snapshot.inspection) {
        resources.push(
          ...(await (snapshot.text === undefined
            ? this.inspectEpub(source, snapshot, options.signal)
            : this.inspectText(source, snapshot, options.signal))),
        );
        resources.unshift(snapshot);
      }
      ensureActive(options.signal);
      const result = await this.inspectionResult(source, snapshot, resources, options);
      ensureActive(options.signal);
      return {
        resources,
        sources:
          options.snapshotId &&
          source.currentSnapshotId &&
          options.snapshotId !== source.currentSnapshotId
            ? []
            : [
                {
                  ...cleanSource(source),
                  currentSnapshotId: snapshot.id,
                  status: result.success
                    ? snapshot.id === source.currentSnapshotId && source.status === 'extracted'
                      ? 'extracted'
                      : 'inspected'
                    : 'failed',
                  ...(result.error ? { error: result.error } : {}),
                },
              ],
        result,
      };
    } catch (error) {
      if (options.signal?.aborted || isCancelledError(error)) throw error;
      const result = errorResult(sourceId, error);
      return {
        resources: [],
        sources: [{ ...source, status: 'failed', error: result.error! }],
        result,
      };
    }
  }

  private async extractOne(
    taskId: string,
    input: { sourceId: string; snapshotId?: string; rules?: ImportExtractionRules },
    signal?: AbortSignal,
  ): Promise<Prepared> {
    const source = await ImportRepository.getActiveSource(taskId, input.sourceId);
    let resources: ImportResource[] = [];
    try {
      if (source.purpose === 'metadata-only')
        throw new Error('METADATA_ONLY: 元信息来源不能提取为小说正文');
      let snapshot: ImportResource | undefined;
      {
        const inspected = await this.prepareInspection(taskId, source.id, {
          ...(signal ? { signal } : {}),
          ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
          ...(input.rules?.encoding ? { encoding: input.rules.encoding } : {}),
        });
        if (!inspected.result.success) return inspected;
        resources = inspected.resources;
        snapshot =
          resources.find((entry) => entry.id === inspected.result.snapshotId) ??
          (await ImportRepository.getResource(taskId, inspected.result.snapshotId!));
      }
      if (snapshot?.kind !== 'snapshot' || snapshot.sourceId !== source.id)
        throw new Error('SOURCE_SCOPE: 快照不属于当前来源');
      if (!snapshot.inspection || snapshot.inspection.format === 'epub')
        throw new Error('SELECT_RESOURCE: 请先检查来源并选择其中的章节资源');
      if (['verification', 'dynamic'].includes(snapshot.inspection.kind))
        throw new Error('SOURCE_UNAVAILABLE: 来源没有可用正文，请补充文件');
      const parsed = (
        await this.parser.run(
          {
            kind: 'content',
            format: snapshot.inspection.format,
            text: snapshot.text ?? '',
            rules: input.rules ?? {},
            ...(source.url ? { baseUrl: snapshot.responseUrl ?? source.url } : {}),
          },
          signal ? { signal } : {},
        )
      ).value;
      if (parsed.kind !== 'content')
        throw new Error('EMPTY_CONTENT: 当前规则没有提取到小说正文，请调整范围');
      const content = ImportContentService.prepareExtraction(snapshot, {
        ...parsed,
        separator: parsed.format === 'html' ? '\n' : '',
      });
      const text = content.blocks.map((block) => block.text).join(content.separator ?? '\n');
      ensureActive(signal);
      resources.push(content);
      return {
        resources,
        sources:
          input.snapshotId &&
          source.currentSnapshotId &&
          input.snapshotId !== source.currentSnapshotId
            ? []
            : [{ ...cleanSource(source), currentSnapshotId: snapshot.id, status: 'extracted' }],
        result: {
          success: true,
          sourceId: source.id,
          snapshotId: snapshot.id,
          contentId: content.id,
          preview: text.slice(0, 4000),
          totalCharacters: text.length,
          warnings: content.warnings,
        },
      };
    } catch (error) {
      if (signal?.aborted || isCancelledError(error)) throw error;
      const result = errorResult(source.id, error);
      return {
        resources,
        sources: [{ ...source, status: 'failed', error: result.error! }],
        result,
      };
    }
  }

  async prepareExtraction(
    taskId: string,
    inputs: { sourceId: string; snapshotId?: string; rules?: ImportExtractionRules }[],
    signal?: AbortSignal,
  ): Promise<{ resources: ImportResource[]; sources: ImportSource[]; results: SourceResult[] }> {
    if (
      !inputs.length ||
      inputs.length > 8 ||
      new Set(inputs.map((input) => input.sourceId)).size !== inputs.length
    )
      throw new Error('BATCH_LIMIT: 一次提取须包含 1–8 个不同来源');
    const batch: { resources: ImportResource[]; sources: ImportSource[]; results: SourceResult[] } =
      { resources: [], sources: [], results: [] };
    for (const input of inputs) {
      ensureActive(signal);
      try {
        const prepared = await this.extractOne(taskId, input, signal);
        batch.resources.push(...prepared.resources);
        batch.sources.push(...prepared.sources);
        batch.results.push(prepared.result);
      } catch (error) {
        if (signal?.aborted || isCancelledError(error)) throw error;
        batch.results.push(errorResult(input.sourceId, error));
      }
    }
    ensureActive(signal);
    return batch;
  }
}
