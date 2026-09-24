import { describe, expect, it } from 'vitest';
import './setup';
import type { BookUpdateRecipe } from '../models/book-sync';
import type { Novel } from '../models/novel';
import { getDB } from '../utils/indexed-db';
import { ImportRepository } from '../services/import/import-repository';
import { ImportRecipeRepair, importRepairPrefill } from '../services/import/import-recipe-repair';
import { importAgentPrompt } from '../services/import/import-agent-prompt';

const recipe: BookUpdateRecipe = {
  version: 1,
  engine: { kind: 'html', content: { selector: 'article' } },
  catalogUrls: ['https://example.com/book'],
  verifiedChapterCount: 3,
  recordedAt: 1,
};
const book = (extra: Partial<Novel> = {}): Novel => ({
  id: 'book',
  title: '作品',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  webUrl: ['https://mirror.example/book'],
  updateRecipe: recipe,
  ...extra,
});

function withoutRecipe(extra: Partial<Novel>): Novel {
  const { updateRecipe: _recipe, ...rest } = book(extra);
  return rest;
}

async function repairTasks() {
  return (await (await getDB()).getAll('import-tasks')).filter(
    (task) => task.purpose?.kind === 'recipe-repair',
  );
}

describe('配方修复任务', () => {
  it('新建时预设任务名、已确认的目标、目录来源和失效原因', async () => {
    const id = await ImportRecipeRepair.open(book(), '目录无法复现至少半数已导入章节');
    const task = await ImportRepository.getTask(id);
    expect(task).toMatchObject({
      name: '修复更新配方：作品',
      state: 'draft',
      purpose: { kind: 'recipe-repair', bookId: 'book', reason: '目录无法复现至少半数已导入章节' },
      draft: { target: { kind: 'existing', bookId: 'book', basis: 'user' } },
    });
    expect(task?.run).toBeUndefined();
    const { items } = await ImportRepository.listSources(id);
    expect(items.map((source) => source.url)).toEqual(['https://example.com/book']);
  });

  it('重复点击只有一个任务', async () => {
    const first = await ImportRecipeRepair.open(book(), '失效');
    const second = await ImportRecipeRepair.open(book(), '失效');
    expect(second).toBe(first);
    expect(await repairTasks()).toHaveLength(1);
  });

  it('已应用或已撤销的修复任务不再复用', async () => {
    const first = await ImportRecipeRepair.open(book(), '失效');
    const db = await getDB();
    await db.put('import-tasks', { ...(await db.get('import-tasks', first))!, state: 'applied' });
    const second = await ImportRecipeRepair.open(book(), '失效');
    expect(second).not.toBe(first);
  });

  it('没有配方时用书籍首个来源网址；都没有时不登记来源', async () => {
    const fallback = await ImportRecipeRepair.open(withoutRecipe({ id: 'b2' }), '缺少配方');
    expect((await ImportRepository.listSources(fallback)).items.map((s) => s.url)).toEqual([
      'https://mirror.example/book',
    ]);
    const none = await ImportRecipeRepair.open(withoutRecipe({ id: 'b3', webUrl: [] }), '缺少配方');
    expect((await ImportRepository.listSources(none)).items).toEqual([]);
  });

  it('只在没有对话的修复任务上预填失效说明', async () => {
    const id = await ImportRecipeRepair.open(book(), '目录无法复现');
    const task = (await ImportRepository.getTask(id))!;
    expect(importRepairPrefill(task, 0)).toContain('目录无法复现');
    expect(importRepairPrefill(task, 3)).toBe('');
    const plain = await ImportRepository.createTask();
    expect(importRepairPrefill(plain, 0)).toBe('');
  });

  it('提示词状态包含原配方与失效原因，并说明配方录入方式', async () => {
    await (await getDB()).put('books', book() as never);
    const id = await ImportRecipeRepair.open(book(), '目录无法复现');
    const prompt = await importAgentPrompt(id);
    expect(prompt).toContain(
      `"repair":${JSON.stringify({ bookId: 'book', previousRecipe: recipe, reason: '目录无法复现' })}`,
    );
    for (const text of [
      'record_update_recipe',
      'catalog_selector',
      '引用范围裁掉',
      'strip_heading',
      '固定正文章节',
      '不要用同样的参数反复重试',
      '只提交配方变化',
    ])
      expect(prompt).toContain(text);
  });

  it('普通任务的提示词状态没有 repair', async () => {
    const task = await ImportRepository.createTask();
    expect(await importAgentPrompt(task.id)).toContain('"repair":null');
  });
});
