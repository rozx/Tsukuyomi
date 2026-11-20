import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
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

  it('新增术语、角色、记忆的工具说明取自站内工具的同一份说明', async () => {
    const { describeTool } = await import('src/services/ai/tools/tool-localization');
    const tool = (name: string) => agentMcpWorldbuildingTools.find((entry) => entry.name === name)!;
    const itemProps = (name: string, key: string) =>
      (
        tool(name).inputSchema.properties[key] as {
          items: { properties: Record<string, { description?: string }> };
        }
      ).items.properties;

    // 术语：什么该建条目、每个术语只留一个译名、描述要短
    expect(tool('upsert_terms').description).toContain(describeTool('create_term'));
    const termProps = itemProps('upsert_terms', 'terms');
    expect(termProps.translation?.description).toBe(
      describeTool('create_term.parameters.properties.translation'),
    );
    expect(termProps.description?.description).toBe(
      describeTool('create_term.parameters.properties.description'),
    );

    // 角色：全名为主名、不自动生成带敬语的别名、描述要短、说话口吻
    const charProps = itemProps('upsert_characters', 'characters');
    expect(charProps.name?.description).toBe(
      describeTool('create_character.parameters.properties.name'),
    );
    expect(charProps.aliases?.description).toBe(
      describeTool('create_character.parameters.properties.aliases'),
    );
    expect(charProps.speaking_style?.description).toBe(
      describeTool('create_character.parameters.properties.speaking_style'),
    );
    expect(tool('upsert_characters').description).toContain('禁止放术语');

    // 记忆：只记可复用的翻译决定，不记剧情
    const memory = tool('upsert_memory');
    expect(memory.description).toContain('严禁保存故事设定、背景、世界观、剧情及情节发展');
    const memoryProps = memory.inputSchema.properties as Record<string, { description?: string }>;
    expect(memoryProps.summary?.description).toBe(
      describeTool('create_memory.parameters.properties.summary'),
    );
    expect(memoryProps.content?.description).toBe(
      describeTool('create_memory.parameters.properties.content'),
    );
    expect(JSON.stringify(memory.inputSchema)).not.toContain('plot point');
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

  it('search_memories 按相关度排序返回并带上分数，不套用翻译注入的严格阈值', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });
    const entries: Array<[string, string]> = [
      ['魔王与地球', '第16卷：魔王开始侵攻地球。'],
      ['女神的委托', '女神委托勇者前往地球。'],
      ['奶奶登场', '勇者的奶奶在第16卷登场。'],
      ['无关条目', '关于料理比赛的记录。'],
    ];
    for (const [summary, content] of entries) {
      await kernel.callTool(
        'upsert_memory',
        { book_id: 'book-wb-1', summary, content },
        { channel: 'desktop-mcp' },
      );
    }
    const searchSpy = vi.spyOn(MemoryService, 'searchMemoriesWithScores');

    const query = '第16卷 魔王 地球 女神 勇者 奶奶';
    const res = await kernel.callTool(
      'search_memories',
      { book_id: 'book-wb-1', query, limit: 10 },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    // 外部 Agent 的主动搜索用「排序」方式，条数由 limit 决定
    expect(searchSpy).toHaveBeenCalledWith('book-wb-1', query, 10, 'zh-CN', { ranked: true });
    const memories = (res.data as { memories: Array<{ summary: string; score: number }> }).memories;
    expect(memories.map((m) => m.summary).sort()).toEqual(
      ['奶奶登场', '女神的委托', '魔王与地球'].sort(),
    );
    const scores = memories.map((m) => m.score);
    expect(scores.every((score) => typeof score === 'number')).toBe(true);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const limited = await kernel.callTool(
      'search_memories',
      { book_id: 'book-wb-1', query, limit: 2 },
      { channel: 'desktop-mcp' },
    );
    expect((limited.data as { memories: unknown[] }).memories).toHaveLength(2);
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

  it('list_terms 与 list_characters 支持分页和精简输出，设定很多的书不会一次塞满上下文', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });
    await kernel.callTool(
      'upsert_terms',
      {
        book_id: 'book-wb-1',
        terms: [1, 2, 3, 4, 5].map((n) => ({
          name: `用語${n}`,
          translation: `术语${n}`,
          description: `很长的说明${n}`,
        })),
      },
      { channel: 'desktop-mcp' },
    );
    type TermPage = {
      total: number;
      has_more: boolean;
      next_offset: number | null;
      terms: Array<Record<string, unknown>>;
    };
    const listTerms = async (args: Record<string, unknown>) =>
      (
        await kernel.callTool(
          'list_terms',
          { book_id: 'book-wb-1', ...args },
          { channel: 'desktop-mcp' },
        )
      ).data as TermPage;

    // 默认仍返回全部，带完整说明
    const all = await listTerms({});
    expect(all.total).toBe(5);
    expect(all.terms).toHaveLength(5);
    expect(all.has_more).toBe(false);
    expect(String(all.terms[0]?.description)).toContain('很长的说明');

    const page = await listTerms({ limit: 2, offset: 2, compact: true });
    expect(page.total).toBe(5);
    // 翻页顺序与不分页时一致
    expect(page.terms.map((t) => t.name)).toEqual(all.terms.slice(2, 4).map((t) => t.name));
    expect(page.has_more).toBe(true);
    expect(page.next_offset).toBe(4);
    // 精简输出只有 ID、名称与译法
    expect(Object.keys(page.terms[0]!).sort()).toEqual(['id', 'name', 'translation']);

    // 关键词过滤后的总数与分页都按过滤结果算
    const filtered = await listTerms({ keyword: '用語5', limit: 10 });
    expect(filtered.total).toBe(1);
    expect(filtered.has_more).toBe(false);

    await kernel.callTool(
      'upsert_characters',
      {
        book_id: 'book-wb-1',
        characters: [
          {
            name: 'レオン',
            translation: '莱昂',
            sex: 'male',
            description: '很长的角色说明',
            speaking_style: '粗鲁',
            aliases: [{ name: 'レオ', translation: '莱奥' }],
          },
          { name: 'ミナ', translation: '米娜' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    const chars = (
      await kernel.callTool(
        'list_characters',
        { book_id: 'book-wb-1', limit: 1, compact: true },
        { channel: 'desktop-mcp' },
      )
    ).data as {
      total: number;
      has_more: boolean;
      characters: Array<Record<string, unknown>>;
    };
    expect(chars.total).toBe(2);
    expect(chars.has_more).toBe(true);
    // 精简输出保留别名（翻译时要靠它认人），去掉说明与说话风格
    expect(Object.keys(chars.characters[0]!).sort()).toEqual([
      'aliases',
      'id',
      'name',
      'translation',
    ]);
    const leon = (
      await kernel.callTool(
        'list_characters',
        { book_id: 'book-wb-1', keyword: 'レオン', compact: true },
        { channel: 'desktop-mcp' },
      )
    ).data as { characters: Array<Record<string, unknown>> };
    expect(leon.characters[0]).toMatchObject({
      name: 'レオン',
      translation: '莱昂',
      aliases: [{ name: 'レオ', translation: '莱奥' }],
    });
  });

  it('list_terms 与 list_characters 的关键词过滤可选模糊匹配，最接近的排在前面', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });
    await kernel.callTool(
      'upsert_terms',
      {
        book_id: 'book-wb-1',
        terms: [
          { name: 'エロ聖女', translation: '色情圣女' },
          { name: '聖銀騎士団', translation: '圣银骑士团' },
          { name: '魔力炉', translation: '魔力炉' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    const listTerms = async (args: Record<string, unknown>) =>
      (
        await kernel.callTool(
          'list_terms',
          { book_id: 'book-wb-1', ...args },
          { channel: 'desktop-mcp' },
        )
      ).data as { total: number; terms: Array<{ name: string }> };

    // 默认精确：写错一个字就找不到
    expect((await listTerms({ keyword: 'エロ性女' })).total).toBe(0);
    // 模糊：能找到，且不会把无关的条目带出来
    const fuzzy = await listTerms({ keyword: 'エロ性女', fuzzy: true });
    expect(fuzzy.terms.map((t) => t.name)).toEqual(['エロ聖女']);
    // 模糊匹配也看译名
    expect((await listTerms({ keyword: '圣银骑土团', fuzzy: true })).terms[0]?.name).toBe(
      '聖銀騎士団',
    );
    // 没有关键词时 fuzzy 不起作用，照常列出全部
    expect((await listTerms({ fuzzy: true })).total).toBe(3);

    await kernel.callTool(
      'upsert_characters',
      {
        book_id: 'book-wb-1',
        characters: [
          {
            name: 'アレクサンドラ',
            translation: '亚历山德拉',
            aliases: [{ name: 'サンドラ姫殿下', translation: '桑德拉公主殿下' }],
          },
          { name: 'ミナ', translation: '米娜' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    const listChars = async (args: Record<string, unknown>) =>
      (
        await kernel.callTool(
          'list_characters',
          { book_id: 'book-wb-1', ...args },
          { channel: 'desktop-mcp' },
        )
      ).data as { total: number; characters: Array<{ name: string }> };
    expect((await listChars({ keyword: 'アレクサンドロ' })).total).toBe(0);
    expect(
      (await listChars({ keyword: 'アレクサンドロ', fuzzy: true })).characters.map((c) => c.name),
    ).toEqual(['アレクサンドラ']);
    // 别名同样参与模糊匹配
    expect(
      (await listChars({ keyword: 'サンドラ妃殿下', fuzzy: true })).characters.map((c) => c.name),
    ).toEqual(['アレクサンドラ']);
  });

  it('delete_terms 与 delete_characters 按 ID 批量删除，找不到的逐项报告', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    const terms = (
      (
        await kernel.callTool(
          'upsert_terms',
          {
            book_id: 'book-wb-1',
            terms: [
              { name: '魔力炉', translation: '魔力炉' },
              { name: '白銀の塔', translation: '白银之塔' },
            ],
          },
          { channel: 'desktop-mcp' },
        )
      ).data as { results: Array<{ id: string }> }
    ).results;

    const deleteRes = await kernel.callTool(
      'delete_terms',
      { book_id: 'book-wb-1', term_ids: [terms[0]!.id, 'missing-id'] },
      { channel: 'desktop-mcp' },
    );
    expect(deleteRes.isError).toBe(false);
    expect(deleteRes.data).toMatchObject({
      deleted_count: 1,
      results: [
        { id: terms[0]!.id, name: '魔力炉', action: 'deleted' },
        { id: 'missing-id', action: 'not_found' },
      ],
    });
    expect(
      (useBooksStore().getBookById('book-wb-1')?.terminologies ?? []).map((t) => t.name),
    ).toEqual(['白銀の塔']);

    const chars = (
      (
        await kernel.callTool(
          'upsert_characters',
          { book_id: 'book-wb-1', characters: [{ name: 'レオン', translation: '莱昂' }] },
          { channel: 'desktop-mcp' },
        )
      ).data as { results: Array<{ id: string }> }
    ).results;
    const deleteCharRes = await kernel.callTool(
      'delete_characters',
      { book_id: 'book-wb-1', character_ids: [chars[0]!.id] },
      { channel: 'desktop-mcp' },
    );
    expect(deleteCharRes.data).toMatchObject({
      deleted_count: 1,
      results: [{ id: chars[0]!.id, name: 'レオン', action: 'deleted' }],
    });
    expect(useBooksStore().getBookById('book-wb-1')?.characterSettings ?? []).toEqual([]);
  });

  it('delete_memories 按 ID 删除记忆；list_memories 分页列出全部记忆，默认不带正文', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    const ids: string[] = [];
    for (const n of [1, 2, 3]) {
      const res = await kernel.callTool(
        'upsert_memory',
        { book_id: 'book-wb-1', summary: `记忆${n}`, content: `第${n}条记忆的正文` },
        { channel: 'desktop-mcp' },
      );
      ids.push((res.data as { id: string }).id);
    }

    const listRes = await kernel.callTool(
      'list_memories',
      { book_id: 'book-wb-1', limit: 2 },
      { channel: 'desktop-mcp' },
    );
    expect(listRes.isError).toBe(false);
    const page = listRes.data as {
      total: number;
      has_more: boolean;
      next_offset: number | null;
      memories: Array<{ id: string; summary: string; content?: string }>;
    };
    expect(page.total).toBe(3);
    expect(page.memories).toHaveLength(2);
    expect(page.has_more).toBe(true);
    expect(page.next_offset).toBe(2);
    expect(page.memories[0]).not.toHaveProperty('content');

    const rest = (
      await kernel.callTool(
        'list_memories',
        { book_id: 'book-wb-1', limit: 2, offset: 2, include_content: true },
        { channel: 'desktop-mcp' },
      )
    ).data as { has_more: boolean; memories: Array<{ id: string; content?: string }> };
    expect(rest.memories).toHaveLength(1);
    expect(rest.has_more).toBe(false);
    expect(rest.memories[0]?.content).toContain('条记忆的正文');
    // 两页合起来恰好是全部记忆，没有重复
    expect([...page.memories, ...rest.memories].map((m) => m.id).sort()).toEqual([...ids].sort());

    const deleteRes = await kernel.callTool(
      'delete_memories',
      { book_id: 'book-wb-1', memory_ids: [ids[0]!, 'missing-memory'] },
      { channel: 'desktop-mcp' },
    );
    expect(deleteRes.data).toMatchObject({
      deleted_count: 1,
      results: [
        { id: ids[0]!, action: 'deleted' },
        { id: 'missing-memory', action: 'not_found' },
      ],
    });
    const after = (
      await kernel.callTool('list_memories', { book_id: 'book-wb-1' }, { channel: 'desktop-mcp' })
    ).data as { total: number };
    expect(after.total).toBe(2);
  });

  it('删除类工具在「翻译与编辑」权限下可用，只读权限下被拦截；ID 列表为空时报错', async () => {
    const kernel = createAgentMcpKernel({ tools: agentMcpWorldbuildingTools });

    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'translate_and_edit' });
    const names = kernel.listTools('desktop-mcp').map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['delete_terms', 'delete_characters', 'delete_memories']),
    );

    const empty = await kernel.callTool(
      'delete_terms',
      { book_id: 'book-wb-1', term_ids: [] },
      { channel: 'desktop-mcp' },
    );
    expect(empty.errorCode).toBe('INVALID_ARGS');

    await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
    for (const [tool, key] of [
      ['delete_terms', 'term_ids'],
      ['delete_characters', 'character_ids'],
      ['delete_memories', 'memory_ids'],
    ] as const) {
      const denied = await kernel.callTool(
        tool,
        { book_id: 'book-wb-1', [key]: ['x'] },
        { channel: 'desktop-mcp' },
      );
      expect(denied.errorCode).toBe('PERMISSION_DENIED');
    }
    expect(kernel.listTools('desktop-mcp').map((t) => t.name)).toContain('list_memories');
  });
});
