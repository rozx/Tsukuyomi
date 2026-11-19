import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpWorldbuildingTools } from 'src/services/agent-mcp/tools/worldbuilding';

function createBook(): Novel {
  const now = new Date();
  return {
    id: 'book-wb-1',
    title: '世界观测试书',
    targetLanguage: 'zh-CN',
    volumes: [
      {
        id: 'vol-1',
        title: { original: '第一卷', translation: { id: 'vt-1', translation: '', aiModelId: '' } },
        chapters: [
          {
            id: 'ch-1',
            title: {
              original: '第一章',
              translation: { id: 'ct-1', translation: '', aiModelId: '' },
            },
            content: [],
            contentLoaded: true,
            createdAt: now,
            lastEdited: now,
          },
        ],
      },
    ],
    terminologies: [],
    characterSettings: [],
    createdAt: now,
    lastEdited: now,
  };
}

describe('AgentMcp worldbuilding tools', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
    await useBooksStore().addBook(createBook());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upsert_terms 与 list_terms 支持批量新增和按名称/ID幂等更新', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    const createRes = await kernel.callTool(
      'upsert_terms',
      {
        book_id: 'book-wb-1',
        terms: [
          { name: '魔力炉', translation: '魔力炉', description: '核心能源' },
          { name: '白銀の塔', translation: '白银之塔' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(createRes.isError).toBe(false);
    const created = (
      createRes.data as { results: Array<{ id: string; action: string; name: string }> }
    ).results;
    expect(created.map((r) => r.action)).toEqual(['created', 'created']);

    // 按 name 幂等更新 + 按 id 更新
    const updateRes = await kernel.callTool(
      'upsert_terms',
      {
        book_id: 'book-wb-1',
        terms: [
          { name: '魔力炉', translation: '魔导炉', description: '改译为魔导炉' },
          { id: created[1]!.id, name: '白銀の塔', translation: '银白之塔' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(updateRes.isError).toBe(false);
    const updated = (updateRes.data as { results: Array<{ action: string }> }).results;
    expect(updated.map((r) => r.action)).toEqual(['updated', 'updated']);

    const listRes = await kernel.callTool(
      'list_terms',
      { book_id: 'book-wb-1', keyword: '魔' },
      { channel: 'desktop-mcp' },
    );
    expect(listRes.isError).toBe(false);
    const terms = (listRes.data as { terms: Array<{ name: string; translation: string }> }).terms;
    expect(terms).toHaveLength(1);
    expect(terms[0]?.translation).toBe('魔导炉');
  });

  it('upsert_characters 与 list_characters 支持批量创建、别名与幂等更新', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    const createRes = await kernel.callTool(
      'upsert_characters',
      {
        book_id: 'book-wb-1',
        characters: [
          {
            name: 'レオン',
            translation: '莱昂',
            sex: 'male',
            speaking_style: '沉稳',
            aliases: [{ name: '黒騎士', translation: '黑骑士' }],
          },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(createRes.isError).toBe(false);
    const created = (createRes.data as { results: Array<{ id: string; action: string }> }).results;
    expect(created[0]?.action).toBe('created');

    const updateRes = await kernel.callTool(
      'upsert_characters',
      {
        book_id: 'book-wb-1',
        characters: [
          {
            name: 'レオン',
            translation: '里昂',
            speaking_style: '克制冷峻',
          },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(updateRes.isError).toBe(false);
    expect((updateRes.data as { results: Array<{ action: string }> }).results[0]?.action).toBe(
      'updated',
    );

    const listRes = await kernel.callTool(
      'list_characters',
      { book_id: 'book-wb-1' },
      { channel: 'desktop-mcp' },
    );
    const chars = (
      listRes.data as {
        characters: Array<{ name: string; translation: string; aliases: unknown[] }>;
      }
    ).characters;
    expect(chars).toHaveLength(1);
    expect(chars[0]?.translation).toBe('里昂');
    expect(chars[0]?.aliases).toHaveLength(1);
  });

  it('upsert_memory 与 search_memories 支持新增、更新和检索记忆', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    const createRes = await kernel.callTool(
      'upsert_memory',
      {
        book_id: 'book-wb-1',
        summary: '王国议会通过远征法案',
        content: '在第三章结尾，王国议会正式投票通过向北方冰原派遣远征军。',
      },
      { channel: 'desktop-mcp' },
    );
    expect(createRes.isError).toBe(false);
    const memId = (createRes.data as { id: string; action: string }).id;
    expect((createRes.data as { action: string }).action).toBe('created');

    const updateRes = await kernel.callTool(
      'upsert_memory',
      {
        book_id: 'book-wb-1',
        memory_id: memId,
        summary: '王国议会通过北方远征法案',
        content: '在第三章结尾，王国议会以微弱优势通过北方冰原远征法案。',
      },
      { channel: 'desktop-mcp' },
    );
    expect(updateRes.isError).toBe(false);
    expect((updateRes.data as { action: string }).action).toBe('updated');

    const searchRes = await kernel.callTool(
      'search_memories',
      { book_id: 'book-wb-1', query: '北方远征', limit: 5 },
      { channel: 'desktop-mcp' },
    );
    expect(searchRes.isError).toBe(false);
    const memories = (searchRes.data as { memories: Array<{ id: string; summary: string }> })
      .memories;
    expect(memories.some((m) => m.id === memId)).toBe(true);
  });

  it('get_special_instructions 与 update_special_instructions 支持书级与章级读写', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    const updateBookRes = await kernel.callTool(
      'update_special_instructions',
      {
        book_id: 'book-wb-1',
        translation_instructions: '全书保持轻小说口语风格',
        polish_instructions: '润色时减少被动语态',
      },
      { channel: 'desktop-mcp' },
    );
    expect(updateBookRes.isError).toBe(false);

    const updateChapRes = await kernel.callTool(
      'update_special_instructions',
      {
        book_id: 'book-wb-1',
        chapter_id: 'ch-1',
        translation_instructions: '本章战斗节奏紧凑',
      },
      { channel: 'desktop-mcp' },
    );
    expect(updateChapRes.isError).toBe(false);

    const getRes = await kernel.callTool(
      'get_special_instructions',
      { book_id: 'book-wb-1', chapter_id: 'ch-1' },
      { channel: 'desktop-mcp' },
    );
    expect(getRes.isError).toBe(false);
    const data = getRes.data as {
      book: { translation_instructions: string; polish_instructions: string };
      chapter: { translation_instructions: string };
    };
    expect(data.book.translation_instructions).toBe('全书保持轻小说口语风格');
    expect(data.book.polish_instructions).toBe('润色时减少被动语态');
    expect(data.chapter.translation_instructions).toBe('本章战斗节奏紧凑');
  });
});
