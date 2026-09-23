import { describe, expect, it } from 'vitest';
import { importEventsToMessages } from 'src/composables/import-page/import-chat-messages';
import type { ImportEvent } from 'src/models/import';
import { TOOL_CALL_PLACEHOLDER } from 'src/constants/chat';

let sequence = 0;
function event(partial: Partial<ImportEvent> & Pick<ImportEvent, 'kind'>): ImportEvent {
  sequence++;
  return {
    id: `e${sequence}`,
    taskId: 't',
    sequence,
    createdAt: sequence * 1000,
    data: {},
    ...partial,
  };
}

function call(id: string, name: string, args: unknown) {
  return { id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } };
}

describe('导入事件到月詠消息', () => {
  it('批量提取操作显示成功与失败数量，不使用内部工具名称', () => {
    const messages = importEventsToMessages(
      [
        event({
          kind: 'message',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              call('batch', 'run_chapter_batch', { batch_id: 'b', base_draft_revision: 1 }),
            ],
          },
        }),
        event({
          kind: 'tool-result',
          callId: 'batch',
          toolName: 'run_chapter_batch',
          data: { success: true, ready: 97, failed: 3, pending: 0, total: 100 },
        }),
      ],
      { sourceNames: new Map() },
    );
    expect(messages[0]?.actions?.[0]?.name).toContain('成功 97');
    expect(messages[0]?.actions?.[0]?.name).toContain('失败 3');
    expect(messages[0]?.actions?.[0]?.name).not.toContain('run_chapter_batch');
  });

  it('用户与助手消息按顺序展示，工具调用成为助手消息的操作记录，并写明来源与结果', () => {
    const events = [
      event({ kind: 'message', message: { role: 'user', content: '请整理' } }),
      event({ kind: 'tool-call', callId: 'c1', toolName: 'inspect_source', data: '{}' }),
      event({ kind: 'tool-call', callId: 'c2', toolName: 'extract_content', data: '{}' }),
      event({
        kind: 'message',
        message: {
          role: 'assistant',
          content: '先检查来源。',
          tool_calls: [
            call('c1', 'inspect_source', { source_id: 's1' }),
            call('c2', 'extract_content', { sources: [{ source_id: 's1' }, { source_id: 's2' }] }),
          ],
        },
      }),
      event({
        kind: 'tool-result',
        callId: 'c1',
        toolName: 'inspect_source',
        data: { success: true },
      }),
      event({
        kind: 'tool-result',
        callId: 'c2',
        toolName: 'extract_content',
        data: { success: true, results: [{ success: true }, { success: false }] },
      }),
    ];
    const messages = importEventsToMessages(events, {
      sourceNames: new Map([
        ['s1', 'novel.txt'],
        ['s2', 'extra.html'],
      ]),
    });
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.content).toBe('先检查来源。');
    const actions = messages[1]!.actions!;
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'read', tool_name: 'inspect_source' });
    expect(actions[0]!.name).toContain('novel.txt');
    expect(actions[1]).toMatchObject({ type: 'create', tool_name: 'extract_content' });
    expect(actions[1]!.name).toContain('成功 1');
    expect(actions[1]!.name).toContain('失败 1');
  });

  it('失败的工具结果在操作记录中标出错误，未返回结果的调用显示为进行中', () => {
    const events = [
      event({
        kind: 'message',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            call('c1', 'inspect_source', { source_id: 's1' }),
            call('c2', 'list_sources', {}),
          ],
        },
      }),
      event({
        kind: 'tool-result',
        callId: 'c1',
        toolName: 'inspect_source',
        data: {
          success: false,
          error: { code: 'FETCH_FAILED', message: 'FETCH_FAILED: 需要登录' },
        },
      }),
    ];
    const [message] = importEventsToMessages(events, { sourceNames: new Map([['s1', '目录页']]) });
    expect(message!.actions![0]!.name).toContain('失败');
    expect(message!.actions![0]!.name).toContain('需要登录');
    expect(message!.actions![1]!.name).toContain('进行中');
  });

  it('提问沿用问答徽章，回答后补上答案；待办使用待办徽章', () => {
    const events = [
      event({
        kind: 'message',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            call('q1', 'ask_user', { question: '是哪一部？', suggested_answers: ['甲', '乙'] }),
            call('t1', 'create_todo', { items: ['检查目录'] }),
          ],
        },
      }),
      event({ kind: 'question', callId: 'q1', toolName: 'ask_user', data: { questionId: 'x' } }),
      event({
        kind: 'answer',
        callId: 'q1',
        data: { questionId: 'x', answers: [{ questionIndex: 0, answer: '乙', selectedIndex: 1 }] },
      }),
      event({
        kind: 'tool-result',
        callId: 't1',
        toolName: 'create_todo',
        data: { success: true },
      }),
    ];
    const [message] = importEventsToMessages(events, { sourceNames: new Map() });
    expect(message!.actions![0]).toMatchObject({
      type: 'ask',
      entity: 'user',
      tool_name: 'ask_user',
      question: '是哪一部？',
      suggested_answers: ['甲', '乙'],
      answer: '乙',
      selected_index: 1,
    });
    expect(message!.actions![0]!.name).toBeUndefined();
    expect(message!.actions![1]).toMatchObject({ type: 'create', entity: 'todo' });
  });

  it('流式片段作为最后一条临时助手消息，不写入持久事件', () => {
    const messages = importEventsToMessages(
      [event({ kind: 'message', message: { role: 'user', content: '开始' } })],
      { sourceNames: new Map(), streaming: '正在整理' },
    );
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: '正在整理' });
  });

  it('只调用工具的回复不显示「施术中」占位正文', () => {
    const [message] = importEventsToMessages(
      [
        event({
          kind: 'message',
          message: {
            role: 'assistant',
            content: TOOL_CALL_PLACEHOLDER,
            tool_calls: [call('c1', 'list_sources', {})],
          },
        }),
      ],
      { sourceNames: new Map() },
    );
    expect(message!.content).toBe('');
    expect(message!.actions).toHaveLength(1);
  });

  it('工具结果到达后消息标识随之变化，使聊天列表刷新操作记录而不是沿用缓存', () => {
    const reply = event({
      kind: 'message',
      message: { role: 'assistant', content: '', tool_calls: [call('c1', 'list_sources', {})] },
    });
    const before = importEventsToMessages([reply], { sourceNames: new Map() });
    const after = importEventsToMessages(
      [reply, event({ kind: 'tool-result', callId: 'c1', data: { success: true } })],
      { sourceNames: new Map() },
    );
    expect(before[0]!.actions![0]!.name).toContain('进行中');
    expect(after[0]!.actions![0]!.name).not.toContain('进行中');
    expect(after[0]!.id).not.toBe(before[0]!.id);
    expect(importEventsToMessages([reply], { sourceNames: new Map() })[0]!.id).toBe(before[0]!.id);
  });
  it('上下文压缩显示为总结气泡；压缩进行中在末尾显示临时气泡', () => {
    const messages = importEventsToMessages(
      [
        event({ kind: 'message', message: { role: 'user', content: '开始' } }),
        event({ kind: 'summary', data: { reason: 'auto', messages: 12 } }),
      ],
      { sourceNames: new Map(), compacting: true },
    );
    expect(messages[1]).toMatchObject({ role: 'assistant', isSummarization: true });
    expect(messages[1]!.content).toContain('已压缩');
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', isSummarization: true });
    expect(messages.at(-1)!.content).toContain('正在');
  });

  it('命名任务的操作记录写明新名称', () => {
    const [message] = importEventsToMessages(
      [
        event({
          kind: 'message',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [call('c1', 'rename_import_task', { name: '测试小说' })],
          },
        }),
      ],
      { sourceNames: new Map() },
    );
    expect(message!.actions![0]!.name).toContain('命名任务');
    expect(message!.actions![0]!.name).toContain('测试小说');
  });
});
