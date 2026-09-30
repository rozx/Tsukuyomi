import { describe, expect, it } from 'vitest';
import './setup';
import { importEventsToMessages } from '../composables/import-page/import-chat-messages';
import type { ImportEvent } from '../models/import';
import type { AppLocale } from '../models/locale';

const CJK = /[぀-ヿ㐀-鿿]/;

let sequence = 0;
function exchange(id: string, name: string, args: unknown, result?: unknown): ImportEvent[] {
  const events: ImportEvent[] = [
    {
      id: `m-${id}`,
      taskId: 'task',
      sequence: ++sequence,
      createdAt: sequence,
      kind: 'message',
      data: {},
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      },
    },
  ];
  if (result !== undefined)
    events.push({
      id: `r-${id}`,
      taskId: 'task',
      sequence: ++sequence,
      createdAt: sequence,
      kind: 'tool-result',
      callId: id,
      toolName: name,
      data: result,
    });
  return events;
}

/** 覆盖各类导入工具的事件；用户数据全部为 ASCII，便于检查固定文字是否跟随界面语言。 */
function workbenchEvents(): ImportEvent[] {
  const pattern = { mode: 'regex', pattern: '^AD$', flags: 'gm' };
  return [
    ...exchange(
      'o',
      'get_import_draft',
      {},
      {
        success: true,
        draftRevision: 7,
        volumes: [{ id: 'v', title: 'Volume One' }],
        chapterCount: 3,
      },
    ),
    ...exchange(
      'p',
      'get_import_draft',
      { view: 'chapters', offset: 0, limit: 10 },
      {
        success: true,
        chapters: [{ id: 'c1', title: 'Ch 1' }],
        total: 3,
      },
    ),
    ...exchange(
      'c',
      'get_import_draft',
      { view: 'chapter', chapter_id: 'c1' },
      {
        success: true,
        title: 'Ch 1',
        content: [
          { kind: 'extraction', resourceId: 'r1', start: 0, end: 5, excludeRanges: [] },
          { kind: 'existing', bookId: 'b', chapterId: 'x', paragraphId: 'p' },
        ],
      },
    ),
    ...exchange(
      'e',
      'extract_content',
      {
        sources: [
          {
            source_id: 's1',
            rules: { preset: 'auto', ranges: [{ start: 0, end: 5, reason: 'body' }] },
          },
        ],
      },
      {
        success: true,
        results: [{ success: true, sourceId: 's1', contentId: 'r1', totalCharacters: 10 }],
      },
    ),
    ...exchange(
      'r',
      'read_source',
      { resource_id: 'r1', view: 'blocks' },
      {
        success: true,
        items: [{ preview: 'text', truncated: true, reason: 'nav' }],
        total: 1,
      },
    ),
    ...exchange('i', 'read_source', { resource_id: 'r1', view: 'inspection' }, { success: true }),
    ...exchange(
      'd',
      'edit_import_draft',
      {
        base_draft_revision: 7,
        operations: [
          { op: 'set_metadata', field: 'title', value: 'Book' },
          { op: 'remove_chapter', chapterId: 'c1' },
          { op: 'reorder_volumes' },
        ],
      },
      { success: true, draftRevision: 8 },
    ),
    ...exchange(
      'l',
      'list_sources',
      { status: 'failed' },
      {
        success: true,
        items: [{ id: 's1', name: 'a.html', url: 'https://example.com/a' }],
      },
    ),
    ...exchange('b', 'get_book_info', { book_id: 'b' }, { success: true, title: 'Library Book' }),
    ...exchange('lc', 'list_chapters', { book_id: 'b' }, { success: true, items: [], total: 0 }),
    ...exchange(
      'gc',
      'get_chapter_info',
      { book_id: 'b', chapter_id: 'x' },
      {
        success: true,
        title: 'Old',
        paragraphs: [{ text: 'line' }],
      },
    ),
    ...exchange(
      'pv',
      'preview_import',
      { draft_revision: 8 },
      {
        success: true,
        conflicts: [],
        summary: { addedChapters: 1, clearedVersions: 0 },
        completeness: { confirmed: false, knownTotal: 3, missing: ['Ch 3'] },
      },
    ),
    ...exchange(
      'rr',
      'record_update_recipe',
      {
        catalog_source_ids: ['s1'],
        cleanup: [{ action: 'remove_lines', pattern }],
        strip_heading: true,
      },
      {
        success: true,
        engine: 'builtin:ncode',
        verified: 2,
        pinned: 1,
        catalogUrls: ['https://x'],
      },
    ),
    ...exchange(
      'ts',
      'preview_text_structure',
      {
        resource_id: 'r1',
        base_draft_revision: 8,
        volume_id: 'v',
        rules: {
          mode: 'regex',
          chapter_pattern: pattern,
          include_headings: false,
          selection: { start: pattern },
        },
      },
      {
        success: true,
        batchId: 'tb',
        volumes: 1,
        chapters: 2,
        warningCount: 1,
        selected: { start: 0, end: 10 },
        examples: [
          { title: 'Ch 1', start: 0, end: 5, characters: 5, warnings: ['short'], unassigned: true },
          { start: 5, end: 6, reason: 'blank' },
        ],
      },
    ),
    ...exchange(
      'gs',
      'get_text_structure',
      { batch_id: 'tb', view: 'excluded' },
      {
        success: true,
        items: [],
        total: 0,
      },
    ),
    ...exchange(
      'pb',
      'preview_draft_batch',
      {
        base_draft_revision: 8,
        target: 'body',
        scope: { chapter_ids: ['c1'], selected_only: true, title: { pattern: 'Ch' } },
        pattern,
        action: 'remove_lines',
        replacement: '',
      },
      {
        success: true,
        batchId: 'db',
        affected: 1,
        matches: 2,
        examples: [{ id: 'c1', before: 'AD', after: '' }],
      },
    ),
    ...exchange(
      'ab',
      'apply_draft_batch',
      { batch_id: 'db' },
      { success: true, affected: 1, matches: 2 },
    ),
    ...exchange(
      'cb',
      'prepare_chapter_batch',
      {
        volume_id: 'v',
        source_ids: ['s1'],
        catalog: { snapshot_id: 'r1', offset: 0, limit: 5 },
        filter: { name: { mode: 'regex', pattern: 'x', flags: 'i' } },
      },
      { success: true, batchId: 'cb1', ready: 0, failed: 0, pending: 5 },
    ),
    ...exchange(
      'rb',
      'run_chapter_batch',
      { batch_id: 'cb1', retry_failed: true },
      {
        success: true,
        ready: 4,
        failed: 1,
        pending: 0,
      },
    ),
    ...exchange('as', 'add_sources', { discovery_ids: ['s1'] }, { success: true, sources: [] }),
    ...exchange('sb', 'search_books', { query: 'Book' }, { success: true, items: [] }),
    ...exchange('rn', 'rename_import_task', { name: 'Renamed' }, { success: true }),
    ...exchange(
      'f',
      'inspect_source',
      { source_id: 's1' },
      {
        success: false,
        error: { code: 'SOURCE_FAILED', message: 'SOURCE_FAILED: remote said no' },
      },
    ),
    ...exchange('pending', 'extract_novel_info', { source_id: 's1' }),
  ];
}

function actions(locale: AppLocale) {
  return importEventsToMessages(workbenchEvents(), {
    uiLocale: locale,
    sourceNames: new Map([['s1', 'a.html']]),
    task: { name: 'Task', draft: { chapters: [], volumes: [] } },
  }).flatMap((message) => message.actions ?? []);
}

describe('导入工作台操作记录跟随界面语言', () => {
  it('英文界面的操作说明与详情不含中文固定文字', () => {
    const list = actions('en-US');
    expect(list.length).toBeGreaterThan(20);
    const leaks = list.flatMap((action) => [
      action.name ?? '',
      ...(action.descriptionDetails ?? []).flatMap((detail) => [detail.label, detail.value]),
    ]);
    expect(leaks.filter((text) => CJK.test(text))).toEqual([]);
    expect(list.find((action) => action.tool_name === 'get_import_draft')?.name).toContain('Task');
  });

  it('繁中界面使用繁体固定文字，简中保持原有文字', () => {
    const tw = actions('zh-TW');
    const cn = actions('zh-CN');
    expect(tw[0]?.name).toContain('讀取草稿總覽');
    expect(cn[0]?.name).toContain('读取草稿总览：「Task」');
    const joined = tw
      .flatMap((action) => [
        action.name ?? '',
        ...(action.descriptionDetails ?? []).map((detail) => detail.label),
      ])
      .join('\n');
    for (const simplified of ['读取', '来源', '规则', '预览', '应用', '进行中', '状态'])
      expect(joined).not.toContain(simplified);
  });

  it('压缩摘要与进行中提示随界面语言显示', () => {
    const events: ImportEvent[] = [
      {
        id: 's',
        taskId: 'task',
        sequence: 1,
        createdAt: 1,
        kind: 'summary',
        data: {},
      },
    ];
    const [summary] = importEventsToMessages(events, { uiLocale: 'en-US', sourceNames: new Map() });
    expect(summary?.content).not.toMatch(CJK);
    const [compacting] = importEventsToMessages([], {
      uiLocale: 'zh-TW',
      sourceNames: new Map(),
      compacting: true,
    });
    expect(compacting?.content).toBe('正在壓縮對話上下文…');
  });
});
