import { describe, expect, it, spyOn, afterEach, mock } from 'bun:test';
import { getActionDetails } from 'src/utils/action-info-utils';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { Novel } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';

function makeContext(over: Partial<ActionDetailsContext> = {}): ActionDetailsContext {
  return {
    getBookById: () => undefined,
    getCurrentBookId: () => null,
    ...over,
  };
}

function makeAction(over: Partial<MessageAction>): MessageAction {
  return {
    type: 'update',
    entity: 'term',
    timestamp: 0,
    ...over,
  } as MessageAction;
}

describe('getActionDetails', () => {
  afterEach(() => {
    mock.restore();
  });

  it('always includes 操作类型, 实体类型, and 操作时间', () => {
    const details = getActionDetails(makeAction({}), makeContext());
    expect(details.find((d) => d.label === '操作类型')).toBeDefined();
    expect(details.find((d) => d.label === '实体类型')).toBeDefined();
    expect(details.find((d) => d.label === '操作时间')).toBeDefined();
  });

  it('maps known action types to Chinese labels', () => {
    const map: Record<MessageAction['type'], string> = {
      create: '创建',
      update: '更新',
      delete: '删除',
      web_search: '网络搜索',
      web_fetch: '网页获取',
      read: '读取',
      navigate: '导航',
      ask: '提问',
      search: '搜索',
    };
    for (const [type, label] of Object.entries(map)) {
      const details = getActionDetails(
        makeAction({ type: type as MessageAction['type'] }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '操作类型', value: label });
    }
  });

  it('maps known entity types to Chinese labels', () => {
    const entries: Array<[MessageAction['entity'], string]> = [
      ['term', '术语'],
      ['character', '角色'],
      ['web', '网络'],
      ['translation', '翻译'],
      ['chapter', '章节'],
      ['paragraph', '段落'],
      ['book', '书籍'],
      ['memory', '记忆'],
      ['todo', '待办事项'],
      ['user', '用户'],
      ['help_doc', '帮助文档'],
    ];
    for (const [entity, label] of entries) {
      const details = getActionDetails(makeAction({ entity }), makeContext());
      expect(details).toContainEqual({ label: '实体类型', value: label });
    }
  });

  it('includes 名称 when action.name is present', () => {
    const details = getActionDetails(makeAction({ name: '术语X' }), makeContext());
    expect(details).toContainEqual({ label: '名称', value: '术语X' });
  });

  it('omits 名称 when action.name is missing', () => {
    const details = getActionDetails(makeAction({}), makeContext());
    expect(details.find((d) => d.label === '名称')).toBeUndefined();
  });

  it('dispatches ask + user + ask_user_batch to batch branch', () => {
    const details = getActionDetails(
      {
        type: 'ask',
        entity: 'user',
        timestamp: 0,
        tool_name: 'ask_user_batch',
        questions: [{ id: 'q1', text: '确认?', type: 'text' }],
      } as MessageAction,
      makeContext(),
    );
    // ask-user batch should surface its questions
    expect(details.some((d) => d.label.includes('问题') || d.label.includes('询问'))).toBe(true);
  });

  it('dispatches web_search to web details branch', () => {
    const details = getActionDetails(
      {
        type: 'web_search',
        entity: 'web',
        timestamp: 0,
        query: 'hello',
      } as MessageAction,
      makeContext(),
    );
    expect(details.some((d) => d.value === 'hello')).toBe(true);
  });

  it('dispatches web_fetch to web details branch', () => {
    const details = getActionDetails(
      {
        type: 'web_fetch',
        entity: 'web',
        timestamp: 0,
        url: 'https://example.com',
      } as MessageAction,
      makeContext(),
    );
    expect(details.some((d) => d.value === 'https://example.com')).toBe(true);
  });

  it('dispatches todo entity to todo branch', () => {
    const details = getActionDetails(
      {
        type: 'create',
        entity: 'todo',
        timestamp: 0,
        name: '新任务',
      } as MessageAction,
      makeContext(),
    );
    expect(details).toContainEqual({ label: '内容', value: '新任务' });
  });

  it('dispatches translation entity to translation branch', () => {
    spyOn(ChapterService, 'findParagraphLocation').mockReturnValue(null);
    const details = getActionDetails(
      {
        type: 'update',
        entity: 'translation',
        timestamp: 0,
        paragraph_id: 'p1',
      } as MessageAction,
      makeContext(),
    );
    expect(details.some((d) => d.label === '段落 ID' && d.value === 'p1')).toBe(true);
  });

  it('dispatches memory entity to memory branch', () => {
    const details = getActionDetails(
      {
        type: 'update',
        entity: 'memory',
        timestamp: 0,
        memory_id: 'm1',
      } as MessageAction,
      makeContext(),
    );
    expect(details).toContainEqual({ label: 'Memory ID', value: 'm1' });
  });

  it('dispatches read type to read branch', () => {
    const details = getActionDetails(
      {
        type: 'read',
        entity: 'chapter',
        timestamp: 0,
        chapter_id: 'c1',
      } as MessageAction,
      makeContext({
        getCurrentBookId: () => 'b1',
        getBookById: () =>
          ({
            id: 'b1',
            title: 'B',
            volumes: [
              {
                id: 'v1',
                title: 'V',
                chapters: [
                  {
                    id: 'c1',
                    title: '第一章',
                    content: [],
                    createdAt: new Date(),
                    lastEdited: new Date(),
                  },
                ],
              },
            ],
            createdAt: new Date(),
            lastEdited: new Date(),
          }) as Novel,
      }),
    );
    expect(details.length).toBeGreaterThan(3);
  });

  it('dispatches search type to search branch', () => {
    const details = getActionDetails(
      {
        type: 'search',
        entity: 'web',
        timestamp: 0,
        tool_name: 'search_help_docs',
        query: '搜索词',
      } as MessageAction,
      makeContext(),
    );
    expect(details).toContainEqual({ label: '搜索查询', value: '搜索词' });
  });

  it('dispatches update + chapter to chapter-update branch', () => {
    const details = getActionDetails(
      {
        type: 'update',
        entity: 'chapter',
        timestamp: 0,
        tool_name: 'update_chapter_title',
        old_title: '旧',
        new_title: '新',
      } as MessageAction,
      makeContext(),
    );
    expect(details).toContainEqual({ label: '旧标题', value: '旧' });
    expect(details).toContainEqual({ label: '新标题', value: '新' });
  });

  it('dispatches navigate type to navigate branch', () => {
    const details = getActionDetails(
      {
        type: 'navigate',
        entity: 'chapter',
        timestamp: 0,
        chapter_title: '第二章',
      } as MessageAction,
      makeContext(),
    );
    expect(details).toContainEqual({ label: '章节标题', value: '第二章' });
  });

  it('formats 操作时间 with zh-CN locale', () => {
    const ts = Date.UTC(2026, 0, 15, 3, 45, 0);
    const details = getActionDetails(makeAction({ timestamp: ts }), makeContext());
    const timeEntry = details.find((d) => d.label === '操作时间');
    expect(timeEntry).toBeDefined();
    expect(typeof timeEntry?.value).toBe('string');
    // Rough shape: year-month-day + hour:minute:second
    expect(timeEntry?.value.length).toBeGreaterThan(10);
  });
});
