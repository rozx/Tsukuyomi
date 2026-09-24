import type { BookUpdateRecipe, CatalogEntry } from 'src/models/book-sync';
import type {
  ImportDraftChapter,
  ImportExtractionRules,
  ImportRecipeIssue,
  ImportRecipeSelfTest,
  ImportRecipeSummary,
  ImportSource,
} from 'src/models/import';
import type { Chapter } from 'src/models/novel';
import type { ImportSourceFilter } from 'src/models/import-pattern';
import { parseImportHtml } from './import-html-parser';
import { ImportParsingClient } from './import-parsing-client';
import { assembleImportParagraphs } from './import-plan-content';
import { importSourceUrls } from './import-plan-chapters';
import type { ImportPlanContext } from './import-plan-context';
import { parseCatalog, parseChapter } from 'src/services/book-sync/replay';
import { normalizeChapterText } from 'src/services/book-sync/normalize';
import { sameChapterText } from 'src/services/book-sync/changes';
import { BookSyncError } from 'src/services/book-sync/errors';
import { builtinSite } from 'src/services/book-sync/recipe';
import { canonicalStringify } from 'src/utils/canonical-json';
import { UniqueIdGenerator } from 'src/utils/id-generator';

/** record_update_recipe 的宿主侧参数；pinnedChapterIds 在构造配方时换成网址。 */
export interface ImportRecipeDeclaration {
  catalogSourceIds: string[];
  catalogSelector?: string;
  chapterFilter?: ImportSourceFilter;
  contentRules?: ImportExtractionRules;
  cleanup?: NonNullable<BookUpdateRecipe['cleanup']>;
  stripHeading?: boolean;
  pinnedChapterIds?: string[];
}

export interface ImportRecipeTestResult extends ImportRecipeSelfTest {
  entries: CatalogEntry[];
  /** 与目录一一对应、网址在草稿中唯一的章节（含未选中章节）：草稿章节 ID → 网址 */
  chapterUrls: Map<string, string>;
}

interface Page {
  html: string;
  url: string;
}
interface SiteChapter {
  chapter: ImportDraftChapter;
  urls: string[];
}

const MAX_EXAMPLES = 5;
/** 固定正文章节最多占站点章节的 1/5（20%），用整数比较避免浮点误差 */
const PINNED_DIVISOR = 5;

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function chapterUrls(context: ImportPlanContext, chapter: ImportDraftChapter): string[] {
  return [
    ...new Set(
      chapter.sourceIds.flatMap((id) => importSourceUrls(context.sources.get(id), context.sources)),
    ),
  ];
}

function activeUrlSources(context: ImportPlanContext): ImportSource[] {
  return [...context.sources.values()].filter(
    (source) =>
      source.kind === 'url' &&
      source.url &&
      source.removedAt === undefined &&
      source.purpose !== 'metadata-only',
  );
}

async function snapshotPage(
  context: ImportPlanContext,
  snapshotId: string | undefined,
  fallbackUrl: string,
): Promise<Page | undefined> {
  if (!snapshotId) return undefined;
  const resource = await context.resource(snapshotId).catch(() => undefined);
  if (resource?.kind !== 'snapshot' || resource.text === undefined) return undefined;
  return { html: resource.text, url: resource.responseUrl ?? fallbackUrl };
}

/** 按网址找任务里已保存的页面快照（目录分页用）。 */
function pageByUrl(context: ImportPlanContext, url: string): Promise<Page | undefined> {
  const source = activeUrlSources(context).find((entry) => entry.url === url);
  return source ? snapshotPage(context, source.currentSnapshotId, url) : Promise.resolve(undefined);
}

/** 章节页优先用草稿正文实际来自的那份快照，其次用来源的当前快照。 */
async function chapterPage(
  context: ImportPlanContext,
  chapter: ImportDraftChapter,
  url: string,
): Promise<Page | undefined> {
  for (const ref of chapter.content) {
    if (ref.kind !== 'extraction') continue;
    const resource = await context.resource(ref.resourceId).catch(() => undefined);
    const source = resource && context.sources.get(resource.sourceId);
    if (resource?.kind === 'extraction' && source?.url && url.startsWith(source.url))
      return snapshotPage(context, resource.snapshotId, source.url);
  }
  return pageByUrl(context, url);
}

function issueFrom(error: unknown, fallback: string, chapterId?: string): ImportRecipeIssue {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: error instanceof BookSyncError && /^CLEANUP_/.test(error.code) ? error.code : fallback,
    message,
    ...(chapterId ? { chapterId } : {}),
  };
}

function siteChapters(context: ImportPlanContext, hosts: Set<string>): SiteChapter[] {
  return context.task.draft.chapters.flatMap((chapter) => {
    const urls = chapterUrls(context, chapter);
    return urls.some((url) => hosts.has(hostOf(url) ?? '')) ? [{ chapter, urls }] : [];
  });
}

function isImported(context: ImportPlanContext, chapter: ImportDraftChapter): boolean {
  return context.chapters.some((entry) => entry.id === chapter.id);
}

/** 导入时各章实际使用的提取规则；只保留与网页回放相关的字段。 */
async function importedRules(
  context: ImportPlanContext,
  chapters: SiteChapter[],
): Promise<ImportExtractionRules[]> {
  const variants = new Map<string, ImportExtractionRules>();
  for (const { chapter } of chapters) {
    if (!isImported(context, chapter)) continue;
    for (const ref of chapter.content) {
      if (ref.kind !== 'extraction') continue;
      const resource = await context.resource(ref.resourceId).catch(() => undefined);
      if (resource?.kind !== 'extraction') continue;
      const { preset, selector, excludeSelectors } = resource.rules;
      const rules: ImportExtractionRules = {
        ...(preset ? { preset } : {}),
        ...(selector ? { selector } : {}),
        ...(excludeSelectors?.length ? { excludeSelectors } : {}),
      };
      variants.set(canonicalStringify(rules), rules);
    }
  }
  return [...variants.values()];
}

/** 目录页有下一页链接时跟随翻页；缺少快照的分页由自测报告，不静默只用部分目录。 */
function followsNext(pages: Page[]): boolean {
  return pages.some((page) =>
    parseImportHtml(page.html, {}, page.url).links.some((link) => link.relation === 'next'),
  );
}

/**
 * 校验声明并构造配方（不含 skippedUrls）。内置站点目录交给内置引擎，
 * 但正文仍保留导入时实际使用的提取规则，保证回放口径与导入一致。
 */
export async function buildImportRecipe(
  context: ImportPlanContext,
  declaration: ImportRecipeDeclaration,
): Promise<BookUpdateRecipe> {
  if (!declaration.catalogSourceIds.length)
    throw new Error('SOURCE_NOT_FOUND: 至少需要一个目录来源');
  const catalogs: ImportSource[] = [];
  for (const id of declaration.catalogSourceIds) {
    const source = context.sources.get(id);
    if (
      !source?.url ||
      source.kind !== 'url' ||
      source.removedAt !== undefined ||
      source.purpose === 'metadata-only'
    )
      throw new Error(`SOURCE_NOT_FOUND: 目录来源 ${id} 不是本任务可用的网页来源`);
    if (!source.currentSnapshotId)
      throw new Error(
        `SNAPSHOT_MISSING: 目录来源「${source.name}」还没有快照，请先 inspect_source`,
      );
    catalogs.push(source);
  }
  const catalogUrls = [...new Set(catalogs.map((source) => source.url!))];
  const hosts = new Set(catalogUrls.map((url) => hostOf(url)!));
  if (hosts.size !== 1) throw new Error('SOURCE_NOT_FOUND: 目录网址必须属于同一站点');
  const chapters = siteChapters(context, hosts);
  let content = declaration.contentRules;
  if (!content) {
    const variants = await importedRules(context, chapters);
    if (variants.length > 1)
      throw new Error(
        'CONTENT_MISMATCH: 各章节导入时使用的提取规则不一致，请在 content_rules 中明确给出',
      );
    content = variants[0];
  }
  const pinnedUrls = (declaration.pinnedChapterIds ?? []).map((id) => {
    const found = chapters.find(
      (entry) => entry.chapter.id === id && isImported(context, entry.chapter),
    );
    if (!found || found.urls.length !== 1)
      throw new Error(`PINNED_LIMIT: 固定正文章节 ${id} 不是本配方站点的已选章节`);
    return found.urls[0]!;
  });
  const site = builtinSite(catalogUrls[0]!);
  let engine: BookUpdateRecipe['engine'];
  if (site) engine = { kind: 'builtin', site, ...(content ? { content } : {}) };
  else {
    const pages = (
      await Promise.all(catalogs.map((source) => pageByUrl(context, source.url!)))
    ).filter((page): page is Page => Boolean(page));
    engine = {
      kind: 'html',
      content: content ?? {},
      ...(declaration.catalogSelector ? { catalogSelector: declaration.catalogSelector } : {}),
      ...(declaration.chapterFilter ? { chapterFilter: declaration.chapterFilter } : {}),
      ...(followsNext(pages) ? { followNext: true } : {}),
    };
  }
  return {
    version: 1,
    engine,
    catalogUrls,
    ...(declaration.cleanup?.length ? { cleanup: declaration.cleanup } : {}),
    ...(declaration.stripHeading ? { stripHeading: true } : {}),
    ...(pinnedUrls.length ? { pinnedUrls } : {}),
    verifiedChapterCount: 0,
    recordedAt: Date.now(),
  };
}

/** 与 BookSyncReplay.collectCatalog 相同的逐页顺序，只读取任务里的快照。 */
async function replayCatalog(
  context: ImportPlanContext,
  recipe: BookUpdateRecipe,
  parser: ImportParsingClient,
  signal?: AbortSignal,
): Promise<{ entries: CatalogEntry[]; issues: ImportRecipeIssue[] }> {
  const pending = [...recipe.catalogUrls];
  const visited = new Set<string>();
  const entries = new Map<string, CatalogEntry>();
  const missing: string[] = [];
  let started = false;
  while (pending.length && visited.size < 500) {
    const url = pending.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    const page = await pageByUrl(context, url);
    if (!page) {
      missing.push(url);
      continue;
    }
    let parsed: Awaited<ReturnType<typeof parseCatalog>>;
    try {
      parsed = await parseCatalog(page.html, page.url, recipe, parser, signal);
    } catch (error) {
      return { entries: [], issues: [issueFrom(error, 'SNAPSHOT_MISSING')] };
    }
    if (!started && parsed.startUrl && parsed.startUrl !== url && !visited.has(parsed.startUrl)) {
      pending.unshift(parsed.startUrl);
      continue;
    }
    if (!parsed.catalog.entries.length)
      return {
        entries: [],
        issues: [
          {
            code: 'UNSUPPORTED_GRANULARITY',
            message: `目录页没有识别出章节链接：${url}。请用 catalog_selector 指定目录链接所在范围`,
          },
        ],
      };
    started = true;
    for (const entry of parsed.catalog.entries)
      if (!entries.has(entry.url)) entries.set(entry.url, entry);
    pending.push(...parsed.nextUrls.filter((next) => !visited.has(next)));
  }
  if (missing.length)
    return {
      entries: [],
      issues: [
        {
          code: 'SNAPSHOT_MISSING',
          message: `缺少目录页快照：${missing.join('、')}。请先 add_sources 并 inspect_source 这些页面`,
        },
      ],
    };
  return { entries: [...entries.values()], issues: [] };
}

function granularityIssues(
  context: ImportPlanContext,
  chapters: SiteChapter[],
  entries: Map<string, CatalogEntry>,
): ImportRecipeIssue[] {
  const issues: ImportRecipeIssue[] = [];
  const owners = new Map<string, ImportDraftChapter[]>();
  for (const { chapter, urls } of chapters) {
    if (!isImported(context, chapter)) continue;
    if (urls.length !== 1) {
      issues.push({
        code: 'UNSUPPORTED_GRANULARITY',
        message: `「${chapter.title}」对应多个来源网址，配方不支持合章`,
        chapterId: chapter.id,
      });
      continue;
    }
    const url = urls[0]!;
    if (!entries.has(url)) {
      issues.push({
        code: 'UNSUPPORTED_GRANULARITY',
        message: `「${chapter.title}」的网址不在回放目录中：${url}`,
        chapterId: chapter.id,
      });
      continue;
    }
    owners.set(url, [...(owners.get(url) ?? []), chapter]);
  }
  for (const [url, shared] of owners)
    if (shared.length > 1)
      issues.push({
        code: 'UNSUPPORTED_GRANULARITY',
        message: `${shared.map((chapter) => `「${chapter.title}」`).join('')}共用同一网址，配方不支持拆章：${url}`,
        chapterId: shared[0]!.id,
      });
  return issues;
}

/** 差异示例：优先报告多出或缺少的行，否则报告第一处不同的行。 */
function describeDifference(title: string, draft: string[], replay: string[]): string {
  const count = (lines: string[]) => {
    const counts = new Map<string, number>();
    for (const line of lines.map((entry) => entry.trim()).filter(Boolean))
      counts.set(line, (counts.get(line) ?? 0) + 1);
    return counts;
  };
  const draftCounts = count(draft);
  const replayCounts = count(replay);
  const surplus = (from: Map<string, number>, other: Map<string, number>) =>
    [...from].flatMap(([line, n]) =>
      Array<string>(Math.max(0, n - (other.get(line) ?? 0))).fill(line),
    );
  const extra = surplus(replayCounts, draftCounts);
  if (extra.length) return `「${title}」回放多出 ${extra.length} 行：${extra[0]}`;
  const lacking = surplus(draftCounts, replayCounts);
  if (lacking.length) return `「${title}」回放缺少 ${lacking.length} 行：${lacking[0]}`;
  const index = replay.findIndex((line, i) => line !== draft[i]);
  const at = index < 0 ? Math.min(draft.length, replay.length) : index;
  return `「${title}」回放与草稿在第 ${at + 1} 行不同：${JSON.stringify(replay[at] ?? '')} ≠ ${JSON.stringify(draft[at] ?? '')}`;
}

async function draftLines(
  context: ImportPlanContext,
  chapter: ImportDraftChapter,
): Promise<string[]> {
  const paragraphs = await assembleImportParagraphs(
    context,
    chapter,
    chapter.id,
    new UniqueIdGenerator(),
  );
  return paragraphs.map((paragraph) => paragraph.text);
}

function sameText(draft: string[], replay: string[]): boolean {
  return sameChapterText({ originalContent: draft.join('\n') } as Chapter, [], replay);
}

/** 与目录一一对应、网址在草稿中唯一的章节：草稿章节 ID → 网址。 */
function uniqueChapterUrls(
  chapters: SiteChapter[],
  entries: Map<string, CatalogEntry>,
): Map<string, string> {
  const usage = new Map<string, number>();
  for (const { urls } of chapters)
    for (const url of urls) usage.set(url, (usage.get(url) ?? 0) + 1);
  const result = new Map<string, string>();
  for (const { chapter, urls } of chapters)
    if (urls.length === 1 && entries.has(urls[0]!) && usage.get(urls[0]!) === 1)
      result.set(chapter.id, urls[0]!);
  return result;
}

function pinnedLimitIssue(pinned: number, total: number): ImportRecipeIssue[] {
  if (pinned * PINNED_DIVISOR <= total) return [];
  const limit = Math.floor(total / PINNED_DIVISOR);
  return [
    {
      code: 'PINNED_LIMIT',
      message: `固定正文章节有 ${pinned} 个，超过对应章节数的 20%（最多 ${limit} 个），请改用清理规则`,
    },
  ];
}

type ChapterOutcome =
  | { kind: 'verified' }
  | { kind: 'pinned' }
  | { kind: 'mismatch'; issue: ImportRecipeIssue }
  | { kind: 'issue'; issue: ImportRecipeIssue };

interface ReplayInput {
  context: ImportPlanContext;
  recipe: BookUpdateRecipe;
  parser: ImportParsingClient;
  signal?: AbortSignal | undefined;
}

/** 回放单章并与草稿正文比较；固定正文章节要求回放确实与草稿不同。 */
async function compareChapterReplay(
  input: ReplayInput,
  chapter: ImportDraftChapter,
  entry: CatalogEntry,
): Promise<ChapterOutcome> {
  const { context, recipe, parser, signal } = input;
  const page = await chapterPage(context, chapter, entry.url);
  if (!page)
    return {
      kind: 'issue',
      issue: {
        code: 'SNAPSHOT_MISSING',
        message: `「${chapter.title}」缺少章节页快照，请先 extract_content 或 inspect_source：${entry.url}`,
        chapterId: chapter.id,
      },
    };
  let replay: string[];
  try {
    replay = await normalizeChapterText(parseChapter(page.html, page.url, recipe), recipe, {
      title: entry.title,
      parser,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    return { kind: 'issue', issue: issueFrom(error, 'CONTENT_MISMATCH', chapter.id) };
  }
  const draft = await draftLines(context, chapter);
  const same = sameText(draft, replay);
  if (!recipe.pinnedUrls?.includes(entry.url))
    return same
      ? { kind: 'verified' }
      : {
          kind: 'mismatch',
          issue: {
            code: 'CONTENT_MISMATCH',
            message: describeDifference(chapter.title, draft, replay),
            chapterId: chapter.id,
          },
        };
  if (!same) return { kind: 'pinned' };
  return {
    kind: 'issue',
    issue: {
      code: 'PINNED_LIMIT',
      message: `「${chapter.title}」的回放与草稿相同，不需要固定正文`,
      chapterId: chapter.id,
    },
  };
}

function mismatchExamples(mismatches: ImportRecipeIssue[]): ImportRecipeIssue[] {
  if (mismatches.length <= MAX_EXAMPLES) return mismatches;
  return [
    ...mismatches.slice(0, MAX_EXAMPLES),
    {
      code: 'CONTENT_MISMATCH',
      message: `另有 ${mismatches.length - MAX_EXAMPLES} 章回放与草稿不一致`,
    },
  ];
}

/**
 * 离线自测：只用任务里保存的目录页和章节页快照回放配方，
 * 要求已选站点章节与目录一一对应，并逐段复现草稿正文（固定正文章节除外）。
 */
export async function testImportRecipe(
  context: ImportPlanContext,
  recipe: BookUpdateRecipe,
  options: { parser?: ImportParsingClient; signal?: AbortSignal } = {},
): Promise<ImportRecipeTestResult> {
  const input: ReplayInput = {
    context,
    recipe,
    parser: options.parser ?? new ImportParsingClient(),
    signal: options.signal,
  };
  const catalog = await replayCatalog(context, recipe, input.parser, options.signal);
  const empty = { ok: false, verified: 0, pinned: 0, entries: [], chapterUrls: new Map() };
  if (catalog.issues.length) return { ...empty, issues: catalog.issues };
  const entries = new Map(catalog.entries.map((entry) => [entry.url, entry]));
  const chapters = siteChapters(
    context,
    new Set(recipe.catalogUrls.map((url) => hostOf(url) ?? '')),
  );
  const result: ImportRecipeTestResult = {
    ...empty,
    issues: [],
    entries: catalog.entries,
    chapterUrls: uniqueChapterUrls(chapters, entries),
  };
  const imported = chapters.filter(({ chapter }) => isImported(context, chapter));
  const issues = [
    ...granularityIssues(context, chapters, entries),
    ...pinnedLimitIssue(recipe.pinnedUrls?.length ?? 0, imported.length),
  ];
  const mismatches: ImportRecipeIssue[] = [];
  for (const { chapter } of imported) {
    const url = result.chapterUrls.get(chapter.id);
    if (!url) continue;
    const outcome = await compareChapterReplay(input, chapter, entries.get(url)!);
    if (outcome.kind === 'verified' || outcome.kind === 'pinned') result[outcome.kind]++;
    else if (outcome.kind === 'mismatch') mismatches.push(outcome.issue);
    else {
      issues.push(outcome.issue);
      // 清理规则本身无效时每章都会同样失败，报告一次即可。
      if (/^CLEANUP_/.test(outcome.issue.code)) break;
    }
  }
  result.issues = [...issues, ...mismatchExamples(mismatches)];
  result.ok = !result.issues.length;
  return result;
}

export function summarizeImportRecipe(recipe: BookUpdateRecipe): ImportRecipeSummary {
  return {
    engine: recipe.engine.kind === 'builtin' ? `builtin:${recipe.engine.site}` : 'html',
    catalogUrls: recipe.catalogUrls,
    cleanupRules: recipe.cleanup?.length ?? 0,
    pinned: recipe.pinnedUrls?.length ?? 0,
    stripHeading: Boolean(recipe.stripHeading),
    verifiedChapterCount: recipe.verifiedChapterCount,
  };
}
