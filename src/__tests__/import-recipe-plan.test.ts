import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import type { BookUpdateRecipe } from '../models/book-sync';
import type { Chapter, Novel } from '../models/novel';
import { BookService } from '../services/book-service';
import { ImportRepository } from '../services/import/import-repository';
import { ImportDraftService } from '../services/import/import-draft-service';
import { ImportPlanService } from '../services/import/import-plan-service';
import { ImportApplicationService } from '../services/import/import-application-service';
import { loadImportPlanContext } from '../services/import/import-plan-context';
import {
  buildImportRecipe,
  testImportRecipe,
  type ImportRecipeDeclaration,
} from '../services/import/import-update-recipe';
import { parseChapter } from '../services/book-sync/replay';
import { normalizeChapterText } from '../services/book-sync/normalize';
import { sameChapterText } from '../services/book-sync/changes';
import { getDB } from '../utils/indexed-db';
import {
  CATALOG,
  SITE,
  catalogPage,
  chapterPage,
  recipeParser,
  webTask,
  type WebChapter,
} from './import-update-recipe-fixtures';
import { webLocksFixture } from './web-locks-fixture';

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => vi.unstubAllGlobals());

const url = (n: number) => `${SITE}/book/${n}`;
const oldRecipe: BookUpdateRecipe = {
  version: 1,
  engine: { kind: 'html', content: { selector: 'main' } },
  catalogUrls: ['https://old.example/book'],
  skippedUrls: [
    { url: url(1), title: '第1话' },
    { url: 'https://old.example/extra', title: '番外' },
  ],
  verifiedChapterCount: 7,
  recordedAt: 1,
};

function existingBook(recipe: BookUpdateRecipe | undefined = oldRecipe): Novel {
  return {
    id: 'book',
    title: '作品',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    webUrl: ['https://mirror.example/book', CATALOG],
    ...(recipe ? { updateRecipe: structuredClone(recipe) } : {}),
    volumes: [{ id: 'old-v', title: '旧卷', chapters: [] }],
  };
}

async function target(web: { taskId: string }, revision: number) {
  const draft = await ImportDraftService.edit(
    web.taskId,
    { baseDraftRevision: revision, operations: [{ op: 'propose_target', bookId: 'book' }] },
    { actor: 'user' },
  );
  return draft.revision;
}

async function declare(
  taskId: string,
  revision: number,
  declaration: Partial<ImportRecipeDeclaration> & { catalogSourceIds: string[] },
): Promise<number> {
  const context = await loadImportPlanContext(taskId, revision);
  const recipe = await buildImportRecipe(context, declaration);
  const test = await testImportRecipe(context, recipe, { parser: recipeParser });
  expect(test.issues).toEqual([]);
  return ImportRepository.mutateTask(taskId, (task) => {
    task.draft.updateRecipe = {
      recipe: { ...recipe, verifiedChapterCount: test.verified },
      declaredAtRevision: revision,
      selfTest: { ok: true, verified: test.verified, pinned: test.pinned, issues: [] },
    };
    task.draft.revision++;
    return Promise.resolve(task.draft.revision);
  });
}

async function apply(taskId: string, planId: string) {
  const service = new ImportApplicationService();
  return service.apply(await service.confirmApply(taskId, planId));
}

const trimLast = (resource: { id: string; blocks: { id: string }[] }) => [
  {
    kind: 'extraction' as const,
    resourceId: resource.id,
    blockId: resource.blocks[0]!.id,
    endBlockId: resource.blocks.at(-2)!.id,
  },
];

describe('方案中的配方变化', () => {
  it('新书声明配方：add，写入配方且目录网址为首个来源', async () => {
    const web = await webTask([{ n: 1 }, { n: 2 }]);
    const revision = await declare(web.taskId, web.revision, {
      catalogSourceIds: [web.catalog.id],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.conflicts).toEqual([]);
    expect(plan.recipeChange).toMatchObject({
      kind: 'add',
      verified: 2,
      after: { engine: 'html', catalogUrls: [CATALOG] },
    });
    expect(plan.book.updateRecipe).toMatchObject({
      catalogUrls: [CATALOG],
      verifiedChapterCount: 2,
      skippedUrls: [],
      recordedAt: plan.createdAt,
    });
    expect(plan.book.webUrl).toEqual([CATALOG]);
  });

  it('已有配方、没有声明：keep，原配方保留', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([{ n: 5 }]);
    const plan = await ImportPlanService.preview(web.taskId, await target(web, web.revision));
    expect(plan.recipeChange).toMatchObject({ kind: 'keep', verified: 7 });
    expect(plan.book.updateRecipe).toEqual(oldRecipe);
  });

  it('已有配方、声明通过：replace，目录网址放首位并去重', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([{ n: 5 }]);
    const revision = await declare(web.taskId, await target(web, web.revision), {
      catalogSourceIds: [web.catalog.id],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.recipeChange).toMatchObject({
      kind: 'replace',
      before: { catalogUrls: ['https://old.example/book'] },
      after: { catalogUrls: [CATALOG] },
    });
    expect(plan.book.webUrl).toEqual([CATALOG, 'https://mirror.example/book']);
    expect(plan.book.updateRecipe?.catalogUrls).toEqual([CATALOG]);
  });

  it('声明后又批量删行：stale，本次不写配方，原配方保留且章节照常导入', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([
      { n: 1, lines: ['本文', '次の話へ'] },
      { n: 2, lines: ['本文', '次の話へ'] },
    ]);
    let revision = await declare(web.taskId, await target(web, web.revision), {
      catalogSourceIds: [web.catalog.id],
    });
    const task = await ImportRepository.getTask(web.taskId);
    const chapter = task!.draft.chapters.find((entry) => entry.id === 'c2')!;
    const resource = await ImportRepository.getResource(
      web.taskId,
      (chapter.content[0] as { resourceId: string }).resourceId,
    );
    const { match: _match, ...plain } = chapter;
    revision = (
      await ImportDraftService.edit(
        web.taskId,
        {
          baseDraftRevision: revision,
          operations: [
            {
              op: 'upsert_chapter',
              chapter: {
                ...plain,
                content: trimLast(resource as { id: string; blocks: { id: string }[] }),
              },
            },
          ],
        },
        { actor: 'user' },
      )
    ).revision;
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.recipeChange?.kind).toBe('stale');
    expect(plan.recipeChange?.reason).toContain('配方已失效，本次不会写入配方');
    expect(plan.recipeChange?.issues?.[0]).toMatchObject({ chapterId: 'c2' });
    expect(plan.conflicts).toEqual([]);
    await apply(web.taskId, plan.id);
    const saved = await BookService.getBookById('book');
    // 原配方不变；只有本次导入的第 1 话从跳过列表中移除
    expect(saved?.updateRecipe).toEqual({
      ...oldRecipe,
      skippedUrls: [{ url: 'https://old.example/extra', title: '番外' }],
    });
    expect(saved?.volumes?.flatMap((volume) => volume.chapters ?? [])).toHaveLength(2);
  });
});

describe('跳过列表', () => {
  it('取消勾选的人物介绍进入跳过列表，从未进入草稿的章节不进入', async () => {
    const web = await webTask([{ n: 0, selected: false }, { n: 1 }, { n: 2 }], {
      catalog: catalogPage([0, 1, 2, 3, 4, 5]),
    });
    const revision = await declare(web.taskId, web.revision, {
      catalogSourceIds: [web.catalog.id],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.book.updateRecipe?.skippedUrls).toEqual([{ url: url(0), title: '第0话' }]);
  });

  it('沿用原有跳过列表并移除本次导入的网址', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([{ n: 1 }, { n: 2, selected: false }]);
    const revision = await declare(web.taskId, await target(web, web.revision), {
      catalogSourceIds: [web.catalog.id],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.book.updateRecipe?.skippedUrls).toEqual([
      { url: 'https://old.example/extra', title: '番外' },
      { url: url(2), title: '第2话' },
    ]);
  });
});

describe('仅配方变化的方案', () => {
  it('已有书籍、没有选中章节、配方替换：不报空选择，可以应用', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([{ n: 1, selected: false }]);
    const revision = await declare(web.taskId, await target(web, web.revision), {
      catalogSourceIds: [web.catalog.id],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.conflicts).toEqual([]);
    expect(plan.recipeChange?.kind).toBe('replace');
    expect(plan.chapters).toEqual([]);
    await apply(web.taskId, plan.id);
    expect((await BookService.getBookById('book'))?.updateRecipe?.catalogUrls).toEqual([CATALOG]);
  });

  it('既没有章节也没有配方变化时仍报空选择', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([{ n: 1, selected: false }]);
    const plan = await ImportPlanService.preview(web.taskId, await target(web, web.revision));
    expect(plan.recipeChange?.kind).toBe('keep');
    expect(plan.conflicts.map((conflict) => conflict.code)).toContain('EMPTY_SELECTION');
  });
});

describe('应用与撤销', () => {
  it('撤销替换配方的导入后，配方和 webUrl 恢复原样', async () => {
    await BookService.saveBook(existingBook());
    const web = await webTask([{ n: 5 }]);
    const revision = await declare(web.taskId, await target(web, web.revision), {
      catalogSourceIds: [web.catalog.id],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    await apply(web.taskId, plan.id);
    expect((await BookService.getBookById('book'))?.updateRecipe?.catalogUrls).toEqual([CATALOG]);
    const service = new ImportApplicationService();
    await service.revert(await service.confirmRevert(web.taskId, plan.id));
    const restored = await BookService.getBookById('book');
    expect(restored?.updateRecipe).toEqual(oldRecipe);
    expect(restored?.webUrl).toEqual(['https://mirror.example/book', CATALOG]);
  });

  it('自测通过的草稿应用后，originalContent 与配方回放逐段相同', async () => {
    const chapters: WebChapter[] = [
      { n: 1, lines: ['　一行目', '', '二行目', '次の話へ'], content: trimLast },
      { n: 2, lines: ['「台詞」', '　地の文', '次の話へ'], content: trimLast },
    ];
    const web = await webTask(chapters);
    const revision = await declare(web.taskId, web.revision, {
      catalogSourceIds: [web.catalog.id],
      cleanup: [{ pattern: { mode: 'literal', pattern: '次の話へ' }, action: 'remove_lines' }],
    });
    const plan = await ImportPlanService.preview(web.taskId, revision);
    expect(plan.recipeChange?.kind).toBe('add');
    await apply(web.taskId, plan.id);
    const saved = (await (await getDB()).get('books', plan.targetBookId)) as Novel;
    const recipe = saved.updateRecipe!;
    const written = (saved.volumes ?? []).flatMap((volume) => volume.chapters ?? []) as Chapter[];
    expect(written).toHaveLength(2);
    for (const [index, chapter] of written.entries()) {
      const n = chapters[index]!.n;
      const replay = await normalizeChapterText(
        parseChapter(chapterPage(n, chapters[index]!.lines!), url(n), recipe),
        recipe,
        { title: `第${n}话`, parser: recipeParser },
      );
      expect(chapter.webUrl).toBe(url(n));
      expect(sameChapterText(chapter, [], replay)).toBe(true);
      expect(chapter.originalContent!.split('\n')).toEqual(replay.join('\n').trimEnd().split('\n'));
    }
  });
});
