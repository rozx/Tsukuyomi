import { afterEach, describe, expect, it } from 'vitest';
import './setup';
import { createApp } from 'vue';
import type { App } from 'vue';
import ChatActionBadge from '../components/layout/ChatActionBadge.vue';
import { importEventsToMessages } from '../composables/import-page/import-chat-messages';
import { getActionDetails } from '../utils/action-info-utils';
import type { ImportEvent } from '../models/import';
import type { MessageAction } from '../stores/chat-sessions';

let app: App | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  app?.unmount();
  host?.remove();
});

function importAction(tool: string, result?: Record<string, unknown>): MessageAction {
  const events: ImportEvent[] = [
    {
      id: 'message',
      taskId: 'task',
      sequence: 1,
      createdAt: 1,
      kind: 'message',
      data: {},
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call',
            type: 'function',
            function: { name: tool, arguments: '{}' },
          },
        ],
      },
    },
  ];
  if (result)
    events.push({
      id: 'result',
      taskId: 'task',
      sequence: 2,
      createdAt: 2,
      kind: 'tool-result',
      callId: 'call',
      toolName: tool,
      data: result,
    });
  return importEventsToMessages(events, { sourceNames: new Map() })[0]!.actions![0]!;
}

function badgeText(action: MessageAction): string {
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(ChatActionBadge, {
    action,
    messageId: 'message',
    timestamp: 1,
    popoverKey: 'action',
    getChapterTitleForAction: () => undefined,
  });
  app.mount(host);
  return host.textContent!.replace(/\s+/g, ' ').trim();
}

const failure = {
  success: false,
  error: { message: 'INVALID_PAGE: 范围超出当前快照已发现的章节，不能把截断当作完整目录' },
};
const failureText = '准备章节批次（失败：范围超出当前快照已发现的章节，不能把截断当作完整目录）';

describe('导入操作气泡的完整说明', () => {
  it('准备批次失败时直接显示实际说明，不加创建章节前缀或实体名称引号', () => {
    expect(badgeText(importAction('prepare_chapter_batch', failure))).toBe(failureText);
  });

  it('读取草稿进行中也直接显示说明，不重复拼接读取章节', () => {
    expect(badgeText(importAction('get_import_draft'))).toBe(
      '读取草稿总览：「当前任务」（进行中）',
    );
  });

  it('详情中的导入说明也不被解释成创建操作或章节名称', () => {
    const details = getActionDetails(importAction('prepare_chapter_batch', failure), {
      getBookById: () => undefined,
      getCurrentBookId: () => null,
    });
    expect(details).toContainEqual({ label: '操作说明', value: failureText });
    expect(details.some((detail) => ['操作类型', '实体类型', '名称'].includes(detail.label))).toBe(
      false,
    );
    expect(details.some((detail) => detail.label === '操作时间')).toBe(true);
  });

  it('普通聊天仍展示操作类型和实体名称', () => {
    expect(badgeText({ type: 'create', entity: 'chapter', name: '第一章', timestamp: 1 })).toBe(
      '创建 章节 "第一章"',
    );
  });
});
