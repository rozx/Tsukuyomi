import { describe, expect, it } from 'vitest';
import './setup';
import { getDB } from '../utils/indexed-db';
import { ImportRepository } from '../services/import/import-repository';
import { loadImportPlanContext } from '../services/import/import-plan-context';
import {
  buildImportRecipe,
  testImportRecipe,
  type ImportRecipeDeclaration,
} from '../services/import/import-update-recipe';
import { parseImportHtml } from '../services/import/import-html-parser';
import {
  SITE,
  addPage,
  catalogPage,
  extractPage,
  recipeParser,
  webTask,
} from './import-update-recipe-fixtures';

async function selfTest(
  task: Awaited<ReturnType<typeof webTask>>,
  declaration: Partial<ImportRecipeDeclaration> = {},
) {
  const context = await loadImportPlanContext(task.taskId, task.revision);
  const recipe = await buildImportRecipe(context, {
    catalogSourceIds: [task.catalog.id],
    ...declaration,
  });
  return { recipe, result: await testImportRecipe(context, recipe, { parser: recipeParser }) };
}

describe('旧数据兼容', () => {
  it('没有 purpose 与 updateRecipe 的旧任务照常读取', async () => {
    const task = await ImportRepository.createTask();
    const legacy = structuredClone(task) as Partial<typeof task>;
    delete legacy.purpose;
    delete legacy.draft!.updateRecipe;
    await (await getDB()).put('import-tasks', legacy as typeof task);
    const read = await ImportRepository.getTask(task.id);
    expect(read?.purpose).toBeUndefined();
    expect(read?.draft.updateRecipe).toBeUndefined();
    expect(read?.draft.revision).toBe(task.draft.revision);
  });
});

describe('目录收集', () => {
  it('合并经 next 发现并已保存快照的分页，按顺序去重', async () => {
    const page2 = `${SITE}/book?p=2`;
    const task = await webTask([{ n: 1 }, { n: 2 }, { n: 3 }], {
      catalog: catalogPage([1, 2], '/book?p=2'),
      extraPages: { [page2]: catalogPage([2, 3]) },
    });
    const { recipe, result } = await selfTest(task);
    expect(recipe.engine).toMatchObject({ kind: 'html', followNext: true });
    expect(result.entries.map((entry) => entry.url)).toEqual([
      `${SITE}/book/1`,
      `${SITE}/book/2`,
      `${SITE}/book/3`,
    ]);
    expect(result.ok).toBe(true);
  });

  it('内置站点的后续目录页没有快照时报告缺少快照，不请求网络', async () => {
    const root = 'https://ncode.syosetu.com/n1234ab/';
    const index = `<html><head><title>作品</title></head><body><div class="l-container"><main><article><h1>作品</h1><div class="p-eplist"><div class="p-eplist__sublist"><a class="p-eplist__subtitle" href="/n1234ab/1/">第1话</a></div></div><a rel="next" href="?p=2">次へ</a></article></main></div></body></html>`;
    const task = await ImportRepository.createTask();
    const catalog = await addPage(task.id, root, index);
    const context = await loadImportPlanContext(task.id, 0);
    const recipe = await buildImportRecipe(context, { catalogSourceIds: [catalog.id] });
    const result = await testImportRecipe(context, recipe, { parser: recipeParser });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'SNAPSHOT_MISSING' });
    expect(result.issues[0]!.message).toContain('?p=2');
  });
});

describe('一一对应', () => {
  it('拆章：两个章节共用同一网址', async () => {
    const url = `${SITE}/book/12`;
    const task = await webTask([
      { n: 12, url, title: '第12话（上）' },
      { n: 12, url, title: '第12话（下）' },
    ]);
    const { result } = await selfTest(task);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'UNSUPPORTED_GRANULARITY' });
    expect(result.issues[0]!.message).toContain('第12话（上）');
    expect(result.issues[0]!.message).toContain('第12话（下）');
  });

  it('合章：一个章节对应多个网址', async () => {
    const task = await webTask([{ n: 1 }, { n: 2 }]);
    const context = await loadImportPlanContext(task.taskId, task.revision);
    const merged = {
      ...task.drafts[0]!,
      content: [...task.drafts[0]!.content, ...task.drafts[1]!.content],
      sourceIds: [...task.drafts[0]!.sourceIds, ...task.drafts[1]!.sourceIds],
    };
    context.task.draft.chapters = [merged];
    context.chapters = [merged];
    const recipe = await buildImportRecipe(context, { catalogSourceIds: [task.catalog.id] });
    const result = await testImportRecipe(context, recipe, { parser: recipeParser });
    expect(result.issues[0]).toMatchObject({ code: 'UNSUPPORTED_GRANULARITY', chapterId: 'c1' });
  });

  it('章节网址不在目录中', async () => {
    const task = await webTask([{ n: 1 }, { n: 9 }], { catalog: catalogPage([1]) });
    const { result } = await selfTest(task);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'UNSUPPORTED_GRANULARITY', chapterId: 'c9' }),
    ]);
  });
});

describe('正文逐段比对', () => {
  const withoutLast = (
    resource: Parameters<NonNullable<Parameters<typeof webTask>[0][0]['content']>>[0],
  ) => [
    {
      kind: 'extraction' as const,
      resourceId: resource.id,
      blockId: resource.blocks[0]!.id,
      endBlockId: resource.blocks.at(-2)!.id,
    },
  ];

  it('缺少「次の話へ」清理规则时返回差异示例', async () => {
    const task = await webTask([
      { n: 1 },
      { n: 3, lines: ['本文', '次の話へ'], content: withoutLast },
    ]);
    const { result } = await selfTest(task);
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(1);
    expect(result.issues[0]).toMatchObject({ code: 'CONTENT_MISMATCH', chapterId: 'c3' });
    expect(result.issues[0]!.message).toBe('「第3话」回放多出 1 行：次の話へ');
  });

  it('补上清理规则后自测通过', async () => {
    const task = await webTask([{ n: 3, lines: ['本文', '次の話へ'], content: withoutLast }]);
    const { result } = await selfTest(task, {
      cleanup: [{ pattern: { mode: 'literal', pattern: '次の話へ' }, action: 'remove_lines' }],
    });
    expect(result).toMatchObject({ ok: true, verified: 1, issues: [] });
  });

  it('差异示例最多五条', async () => {
    const chapters = Array.from({ length: 7 }, (_, i) => ({
      n: i + 1,
      lines: ['本文', '次の話へ'],
      content: withoutLast,
    }));
    const { result } = await selfTest(await webTask(chapters));
    expect(result.issues.filter((issue) => issue.chapterId)).toHaveLength(5);
    expect(result.issues.at(-1)!.message).toContain('另有 2 章');
  });

  it('用引用范围裁掉标题但没有声明 strip_heading 时失败', async () => {
    const withoutHeading = (resource: Parameters<typeof withoutLast>[0]) => [
      {
        kind: 'extraction' as const,
        resourceId: resource.id,
        blockId: resource.blocks[1]!.id,
        endBlockId: resource.blocks.at(-1)!.id,
      },
    ];
    const task = await webTask([{ n: 1, content: withoutHeading }]);
    expect((await selfTest(task)).result.issues[0]).toMatchObject({ code: 'CONTENT_MISMATCH' });
    expect((await selfTest(task, { stripHeading: true })).result.ok).toBe(true);
  });
});

describe('固定正文章节与快照', () => {
  const chapters = (count: number, changed: number[]) =>
    Array.from({ length: count }, (_, i) => ({
      n: i + 1,
      lines: ['本文', '手工'],
      content: changed.includes(i + 1)
        ? (resource: { id: string; blocks: { id: string }[] }) => [
            {
              kind: 'extraction' as const,
              resourceId: resource.id,
              blockId: resource.blocks[0]!.id,
              endBlockId: resource.blocks.at(-2)!.id,
            },
          ]
        : undefined,
    }));

  it('恰好 20% 的固定章节可以通过', async () => {
    const task = await webTask(chapters(5, [2]));
    const { result } = await selfTest(task, { pinnedChapterIds: ['c2'] });
    expect(result).toMatchObject({ ok: true, verified: 4, pinned: 1 });
  });

  it('超过 20% 时拒绝并建议改用清理规则', async () => {
    const task = await webTask(chapters(5, [2, 3]));
    const { result } = await selfTest(task, { pinnedChapterIds: ['c2', 'c3'] });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ code: 'PINNED_LIMIT' });
    expect(result.issues[0]!.message).toContain('清理规则');
  });

  it('固定章节的回放必须确实与草稿不同', async () => {
    const task = await webTask(chapters(5, []));
    const { result } = await selfTest(task, { pinnedChapterIds: ['c2'] });
    expect(result.issues[0]).toMatchObject({ code: 'PINNED_LIMIT', chapterId: 'c2' });
  });

  it('章节页缺少快照时报告需要先检查的页面', async () => {
    const task = await webTask([{ n: 1 }]);
    const db = await getDB();
    const source = task.sources.at(-1)!;
    const stored = (await db.get('import-sources', source.id))!;
    const context = await loadImportPlanContext(task.taskId, task.revision);
    context.task.draft.chapters[0]!.content = [];
    context.chapters[0]!.content = [];
    delete stored.currentSnapshotId;
    context.sources.set(source.id, stored);
    const recipe = await buildImportRecipe(context, { catalogSourceIds: [task.catalog.id] });
    const result = await testImportRecipe(context, recipe, { parser: recipeParser });
    expect(result.issues[0]).toMatchObject({ code: 'SNAPSHOT_MISSING', chapterId: 'c1' });
  });
});

describe('来源校验', () => {
  it('目录网址不是本任务来源时拒绝', async () => {
    const task = await webTask([{ n: 1 }]);
    const context = await loadImportPlanContext(task.taskId, task.revision);
    await expect(buildImportRecipe(context, { catalogSourceIds: ['other'] })).rejects.toThrow(
      'SOURCE_NOT_FOUND',
    );
  });
});

describe('内置站点', () => {
  const root = 'https://ncode.syosetu.com/n1234ab/';
  const index = `<html><head><title>作品</title></head><body><div class="l-container"><main><article><h1>作品</h1><div class="p-eplist"><div class="p-eplist__sublist"><a class="p-eplist__subtitle" href="/n1234ab/1/">第1话</a><div class="p-eplist__update">2026/09/22 12:00</div></div></div></article></main></div></body></html>`;
  const body =
    '<html><body><div class="p-novel__body"><div class="p-novel__text p-novel__text--preface"><p>前書き</p></div><div class="p-novel__text"><p>　本文</p><p></p><p>続き</p></div><div class="p-novel__text p-novel__text--afterword"><p>後書き</p></div></div></body></html>';

  async function ncodeTask(rules: Parameters<typeof extractPage>[2][] = [{}]) {
    const task = await ImportRepository.createTask();
    const catalog = await addPage(task.id, root, index);
    const sources = [catalog];
    const chapters = [];
    for (const [i, rule] of rules.entries()) {
      const page = await addPage(task.id, `${root}${i + 1}/`, body);
      sources.push(page);
      const resource = await extractPage(task.id, page.id, rule);
      chapters.push({ page, resource });
    }
    const { ImportDraftService } = await import('../services/import/import-draft-service');
    const draft = await ImportDraftService.edit(task.id, {
      baseDraftRevision: 0,
      operations: [
        {
          op: 'declare_candidates',
          candidates: [{ id: 'n', title: '作品', sourceIds: sources.map((s) => s.id) }],
        },
        { op: 'upsert_volume', id: 'v', title: '正文' },
        ...chapters.map(({ page, resource }, i) => ({
          op: 'upsert_chapter' as const,
          chapter: {
            id: `c${i + 1}`,
            volumeId: 'v',
            title: '第1话',
            inferredTitle: true,
            inferredStructure: true,
            selected: true,
            content: [{ kind: 'extraction' as const, resourceId: resource.id }],
            sourceIds: [page.id],
            status: 'ready' as const,
          },
        })),
      ],
    });
    return { taskId: task.id, catalog, revision: draft.revision, chapters };
  }

  it('采用 builtin 引擎，并保留导入时实际使用的正文规则', async () => {
    const task = await ncodeTask([{}]);
    const context = await loadImportPlanContext(task.taskId, task.revision);
    const recipe = await buildImportRecipe(context, {
      catalogSourceIds: [task.catalog.id],
      catalogSelector: '.ignored',
      chapterFilter: { name: { mode: 'literal', pattern: '无关' } },
    });
    expect(recipe.engine).toEqual({ kind: 'builtin', site: 'ncode', content: {} });
    expect(recipe.catalogUrls).toEqual([root]);
    const result = await testImportRecipe(context, recipe, { parser: recipeParser });
    expect(result).toMatchObject({ ok: true, verified: 1 });
    const imported = task.chapters[0]!.resource.blocks.map((block) => block.text).join('\n');
    const replayed = parseImportHtml(body, {}, `${root}1/`)
      .blocks.map((block) => block.text)
      .join('\n');
    expect(replayed).toBe(imported);
    expect(imported).toContain('前書き');
  });

  it('Agent 给出的正文规则优先', async () => {
    const task = await ncodeTask([{ preset: 'ncode' }]);
    const context = await loadImportPlanContext(task.taskId, task.revision);
    const recipe = await buildImportRecipe(context, {
      catalogSourceIds: [task.catalog.id],
      contentRules: { preset: 'ncode', excludeSelectors: ['.p-novel__text--preface'] },
    });
    expect(recipe.engine).toMatchObject({
      content: { preset: 'ncode', excludeSelectors: ['.p-novel__text--preface'] },
    });
  });

  it('各章节导入规则不一致时拒绝', async () => {
    const task = await ncodeTask([{}, { preset: 'ncode' }]);
    const context = await loadImportPlanContext(task.taskId, task.revision);
    await expect(
      buildImportRecipe(context, { catalogSourceIds: [task.catalog.id] }),
    ).rejects.toThrow('CONTENT_MISMATCH');
  });
});
