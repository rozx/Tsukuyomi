import { describe, expect, it } from 'vitest';
import './setup';
import { importEventsToMessages } from '../composables/import-page/import-chat-messages';
import { getActionDetails } from '../utils/action-info-utils';
import type { ImportEvent } from '../models/import';

function exchange(id: string, name: string, args: unknown, result?: unknown): ImportEvent[] {
  const events: ImportEvent[] = [
    {
      id: `m-${id}`,
      taskId: 'task',
      sequence: 1,
      createdAt: 1,
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
      sequence: 2,
      createdAt: 2,
      kind: 'tool-result',
      callId: id,
      toolName: name,
      data: result,
    });
  return events;
}
const context = { getBookById: () => undefined, getCurrentBookId: () => null };
const options = {
  sourceNames: new Map<string, string>(),
  task: { name: '测试小说', draft: { chapters: [], volumes: [] } },
};

describe('导入操作对象与完整详情', () => {
  it('区分总览、目录页、单章草稿，范围使用实际返回项而不是请求上限', () => {
    const events = [
      ...exchange(
        'o',
        'get_import_draft',
        {},
        {
          success: true,
          draftRevision: 7,
          volumes: [{ id: 'v', title: '第一卷' }],
          chapterCount: 113,
        },
      ),
      ...exchange(
        'p',
        'get_import_draft',
        { view: 'chapters', offset: 30, limit: 100 },
        {
          success: true,
          draftRevision: 7,
          chapters: [
            { id: 'c31', title: '第31话 回家' },
            { id: 'c32', title: '第32话 约定' },
          ],
          total: 113,
        },
      ),
      ...exchange(
        'c',
        'get_import_draft',
        { view: 'chapter', chapter_id: 'c31' },
        {
          success: true,
          id: 'c31',
          title: '第31话 回家',
          draftRevision: 7,
          content: [{ kind: 'extraction', resourceId: 'r' }],
          total: 1,
        },
      ),
    ];
    const actions = importEventsToMessages(events, options).flatMap((m) => m.actions ?? []);
    expect(actions[0]?.name).toContain('读取草稿总览：「测试小说」');
    expect(actions[1]?.name).toContain('第31–32章／共113章');
    expect(actions[2]?.name).toContain('第31话 回家');
    const details = getActionDetails(actions[1]!, context);
    expect(details).toContainEqual({ label: '草稿版本', value: '7' });
    expect(details).toContainEqual({ label: '本页章节', value: '第31话 回家\n第32话 约定' });
  });
  it('来源读取能沿历史提取记录找到名称，popover 展示实际读取文本、范围和资源标识', () => {
    const events = [
      ...exchange(
        'e',
        'extract_content',
        { sources: [{ source_id: 's1' }] },
        { success: true, results: [{ success: true, sourceId: 's1', contentId: 'r1' }] },
      ),
      ...exchange(
        'r',
        'read_source',
        { resource_id: 'r1', offset: 20, limit: 100 },
        { success: true, text: '短内容', offset: 20, total: 80 },
      ),
    ];
    const action = importEventsToMessages(events, {
      ...options,
      sourceNames: new Map([['s1', '第一话.html']]),
      sources: [{ id: 's1', name: '第一话.html', url: 'https://example.com/chapter/1' }],
    }).at(-1)!.actions![0]!;
    expect(action.name).toContain('第一话.html');
    expect(action.name).toContain('第21–23字符／共80字符');
    expect(getActionDetails(action, context)).toEqual(
      expect.arrayContaining([
        { label: '资源 ID', value: 'r1' },
        { label: '来源位置', value: 'https://example.com/chapter/1' },
        { label: '读取的原文', value: '短内容' },
      ]),
    );
  });

  it('应用批次关联对应预览的范围和完整正则，不误用另一批次；详情保留修改示例', () => {
    const pattern = '^' + '长规则'.repeat(30) + '$';
    const args = {
      base_draft_revision: 8,
      target: 'body',
      scope: { volume_ids: ['v4'] },
      pattern: { mode: 'regex', pattern, flags: 'gm' },
      action: 'remove_lines',
    };
    const events = [
      ...exchange('p1', 'preview_draft_batch', args, {
        success: true,
        batchId: 'b1',
        draftRevision: 8,
        affected: 12,
        matches: 12,
        examples: [{ id: 'c', before: '广告\n正文', after: '正文' }],
      }),
      ...exchange(
        'p2',
        'preview_draft_batch',
        { ...args, scope: {}, action: 'remove_matches' },
        { success: true, batchId: 'b2', affected: 113, matches: 113 },
      ),
      ...exchange(
        'a',
        'apply_draft_batch',
        { batch_id: 'b1' },
        {
          success: true,
          batchId: 'b1',
          draftRevision: 9,
          affected: 12,
          matches: 12,
          examples: [{ id: 'c', before: '广告\n正文', after: '正文' }],
        },
      ),
    ];
    const action = importEventsToMessages(events, {
      ...options,
      task: { ...options.task, draft: { chapters: [], volumes: [{ id: 'v4', title: '第4卷' }] } },
    }).at(-1)!.actions![0]!;
    expect(action.name).toContain('第4卷');
    expect(action.name).toContain('删除整行');
    expect(action.name!.length).toBeLessThan(220);
    const details = getActionDetails(action, context);
    expect(details).toContainEqual({ label: '正则表达式', value: pattern });
    expect(details).toContainEqual({ label: '正则标志', value: 'gm' });
    expect(details).toContainEqual({ label: '示例 1 · 修改前', value: '广告\n正文' });
    expect(details).toContainEqual({ label: '示例 1 · 修改后', value: '正文' });
  });

  it('提取批次明确目标卷和来源，详情列出全部对象、筛选条件及结果', () => {
    const events = exchange(
      'p',
      'prepare_chapter_batch',
      {
        volume_id: 'v',
        source_ids: ['s1', 's2', 's3'],
        base_draft_revision: 2,
        filter: { name: { mode: 'regex', pattern: '^第', flags: 'i' } },
      },
      {
        success: true,
        batchId: 'batch',
        draftRevision: 3,
        total: 3,
        ready: 0,
        failed: 0,
        pending: 3,
      },
    );
    const action = importEventsToMessages(events, {
      ...options,
      sourceNames: new Map([
        ['s1', '第一章'],
        ['s2', '第二章'],
        ['s3', '第三章'],
      ]),
      task: { ...options.task, draft: { chapters: [], volumes: [{ id: 'v', title: '第1卷' }] } },
    })[0]!.actions![0]!;
    expect(action.name).toContain('第1卷');
    const details = getActionDetails(action, context);
    expect(details).toContainEqual({ label: '来源', value: '第一章\n第二章\n第三章' });
    expect(details).toContainEqual({ label: '来源名称筛选', value: '正则：^第；标志：i' });
    expect(details).toContainEqual({ label: '待处理', value: '3' });
  });

  it('未知对象用明确标识兜底；失败和空页不宣称读到了请求范围', () => {
    const failed = importEventsToMessages(
      exchange(
        'c',
        'get_import_draft',
        { view: 'chapter', chapter_id: 'missing-id' },
        { success: false, error: { code: 'CHAPTER_NOT_FOUND', message: '章节已移除' } },
      ),
      options,
    )[0]!.actions![0]!;
    expect(failed.name).toContain('missing-');
    expect(failed.name).toContain('失败');
    expect(getActionDetails(failed, context)).toContainEqual({
      label: '错误代码',
      value: 'CHAPTER_NOT_FOUND',
    });
    const empty = importEventsToMessages(
      exchange(
        'p',
        'get_import_draft',
        { view: 'chapters', offset: 200, limit: 100 },
        { success: true, chapters: [], total: 113 },
      ),
      options,
    )[0]!.actions![0]!;
    expect(empty.name).toContain('返回0章');
    expect(empty.name).not.toContain('第201');
  });

  it('popover 示例变化也更新消息标识，旧缓存不会保留旧详情', () => {
    const args = {
      target: 'body',
      scope: {},
      action: 'remove_lines',
      pattern: { mode: 'literal', pattern: '广告' },
    };
    const result = {
      success: true,
      affected: 1,
      matches: 1,
      examples: [{ id: 'c', before: '旧示例', after: '正文' }],
    };
    const before = importEventsToMessages(
      exchange('p', 'preview_draft_batch', args, result),
      options,
    )[0]!;
    const after = importEventsToMessages(
      exchange('p', 'preview_draft_batch', args, {
        ...result,
        examples: [{ id: 'c', before: '新示例', after: '正文' }],
      }),
      options,
    )[0]!;
    expect(after.actions![0]!.name).toBe(before.actions![0]!.name);
    expect(after.id).not.toBe(before.id);
  });

  it('草稿编辑和书库对照都显示具体对象，详情保留完整操作列表', () => {
    const events = [
      ...exchange(
        'book',
        'get_book_info',
        { book_id: 'book1' },
        { success: true, id: 'book1', title: '书库里的小说' },
      ),
      ...exchange(
        'list',
        'list_chapters',
        { book_id: 'book1' },
        { success: true, total: 1, items: [{ id: 'old', title: '旧章节' }] },
      ),
      ...exchange(
        'edit',
        'edit_import_draft',
        {
          base_draft_revision: 7,
          operations: [
            { op: 'upsert_volume', id: 'v', title: '改好的卷名' },
            { op: 'remove_chapter', chapterId: 'c1' },
          ],
        },
        { success: true, draftRevision: 8 },
      ),
    ];
    const messages = importEventsToMessages(events, {
      ...options,
      task: {
        ...options.task,
        draft: { chapters: [{ id: 'c1', title: '第一话', content: [] }], volumes: [] },
      },
    });
    expect(messages[1]?.actions?.[0]?.name).toContain('书库里的小说');
    const action = messages[2]!.actions![0]!;
    expect(action.name).toContain('改好的卷名');
    expect(getActionDetails(action, context).find((d) => d.label === '草稿操作')?.value).toContain(
      '删除章节：第一话',
    );
  });
  it('文本拆章气泡标明来源与阶段，详情保留完整规则、分页区间和示例', () => {
    const rules = {
      mode: 'regex',
      chapter_pattern: {
        mode: 'regex',
        pattern: '^第(?<number>\\d+)章 (?<title>[^\\r\\n]+)',
        flags: 'm',
      },
      selection: { start: { mode: 'literal', pattern: '正文开始' } },
    };
    const result = {
      success: true,
      batchId: 'structure1',
      sourceId: 's',
      sourceName: '整本小说.txt',
      resourceId: 'r',
      snapshotId: 'snap',
      draftRevision: 7,
      chapters: 113,
      volumes: 9,
      unassigned: 1,
      empty: 0,
      warningCount: 2,
      selected: { start: 30, end: 50000 },
      totalCharacters: 50100,
      excludedCharacters: 100,
      examples: [
        {
          title: '第一章',
          volumeTitle: '卷一',
          start: 50,
          end: 500,
          characters: 450,
          head: '开头\n原文',
          tail: '最后一段',
          warnings: ['检查目录'],
        },
      ],
    };
    const events = [
      ...exchange(
        'p',
        'preview_text_structure',
        { resource_id: 'r', base_draft_revision: 7, rules, replace_chapter_ids: ['old'] },
        result,
      ),
      ...exchange(
        'g',
        'get_text_structure',
        { batch_id: 'structure1', view: 'excluded', offset: 0, limit: 100 },
        {
          ...result,
          rules,
          view: 'excluded',
          offset: 0,
          total: 1,
          items: [{ start: 0, end: 30, reason: '正文选择范围之前' }],
        },
      ),
      ...exchange(
        'a',
        'apply_text_structure',
        { batch_id: 'structure1' },
        { ...result, applied: true, draftRevision: 8 },
      ),
    ];
    const actions = importEventsToMessages(events, options).flatMap((m) => m.actions ?? []);
    expect(actions[0]?.name).toContain('预览文本拆章：「整本小说.txt」');
    expect(actions[0]?.name).toContain('9 卷／113 章');
    expect(actions[1]?.name).toContain('排除记录');
    expect(actions[2]?.name).toContain('应用文本拆章：「整本小说.txt」');
    const details = getActionDetails(actions[2]!, context);
    expect(details).toContainEqual({ label: '章节标题规则', value: rules.chapter_pattern.pattern });
    expect(details).toContainEqual({ label: '正文开始标记', value: '正文开始' });
    expect(details).toContainEqual({ label: '正文选择区间', value: '[30, 50000) · UTF-16' });
    expect(details.some((d) => d.value.includes('开头\n原文'))).toBe(true);
    expect(
      getActionDetails(actions[1]!, context).some((d) => d.value.includes('正文选择范围之前')),
    ).toBe(true);
  });
});

describe('更新配方声明', () => {
  const args = {
    base_draft_revision: 4,
    catalog_source_ids: ['cat'],
    cleanup: [{ pattern: { mode: 'literal', pattern: '次の話へ' }, action: 'remove_lines' }],
    strip_heading: true,
  };
  const withNames = { ...options, sourceNames: new Map([['cat', '作品目录']]) };

  it('进行中只显示目录来源和自测阶段', () => {
    const [action] = importEventsToMessages(
      exchange('r', 'record_update_recipe', args),
      withNames,
    ).flatMap((m) => m.actions ?? []);
    expect(action?.name).toBe('声明更新配方：「作品目录」（进行中）');
    expect(getActionDetails(action!, context)).toContainEqual({
      label: '阶段',
      value: '离线自测中',
    });
  });

  it('通过时显示引擎与可复现章节数', () => {
    const [action] = importEventsToMessages(
      exchange('r', 'record_update_recipe', args, {
        success: true,
        draftRevision: 5,
        engine: 'builtin:ncode',
        catalogUrls: ['https://ncode.syosetu.com/n1234ab/'],
        verified: 12,
        pinned: 1,
      }),
      withNames,
    ).flatMap((m) => m.actions ?? []);
    expect(action?.name).toBe(
      '声明更新配方：「作品目录」 · 内置站点（ncode）（可复现 12 章，固定 1 章）',
    );
    const details = getActionDetails(action!, context);
    expect(details).toContainEqual({ label: '阶段', value: '自测通过，已写入草稿' });
    expect(details).toContainEqual({ label: '引擎', value: '内置站点（ncode）' });
    expect(details).toContainEqual({ label: '清理规则', value: '删除整行：次の話へ' });
    expect(details).toContainEqual({ label: '剥离标题', value: '是' });
  });

  it('未通过时列出差异示例', () => {
    const [action] = importEventsToMessages(
      exchange('r', 'record_update_recipe', args, {
        success: false,
        error: { code: 'CONTENT_MISMATCH', message: '「第3话」回放多出 1 行：次の話へ' },
        issues: [
          { code: 'CONTENT_MISMATCH', message: '「第3话」回放多出 1 行：次の話へ' },
          { code: 'CONTENT_MISMATCH', message: '「第4话」回放缺少 1 行：あとがき' },
        ],
        engine: 'html',
        verified: 3,
        pinned: 0,
      }),
      withNames,
    ).flatMap((m) => m.actions ?? []);
    expect(action?.name).toContain('（失败：「第3话」回放多出 1 行：次の話へ）');
    const details = getActionDetails(action!, context);
    expect(details).toContainEqual({ label: '阶段', value: '自测未通过，草稿未修改' });
    expect(details).toContainEqual({
      label: '差异示例',
      value: '「第3话」回放多出 1 行：次の話へ\n「第4话」回放缺少 1 行：あとがき',
    });
  });
});
