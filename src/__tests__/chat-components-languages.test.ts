import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h, nextTick } from 'vue';
import type { App, Component } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import messages from '../i18n';
import ChatActionBadge from '../components/layout/ChatActionBadge.vue';
import ChatMessageItem from '../components/layout/ChatMessageItem.vue';
import ChatBadgeTranslation from '../components/layout/chat-badge/ChatBadgeTranslation.vue';
import ChatBadgeAsk from '../components/layout/chat-badge/ChatBadgeAsk.vue';
import { SUMMARIZING_MESSAGE_CONTENT } from '../composables/chat/constants';
import type { ChatSessionMessage, MessageAction } from '../stores/chat-sessions';

let app: App | undefined;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function mount(component: Component, props: Record<string, unknown>) {
  const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
  const host = document.body.appendChild(document.createElement('div'));
  app = createApp({ setup: () => () => h(component, props) });
  app.use(createPinia()).use(PrimeVue).use(i18n).mount(host);
  const text = () => host.textContent!.replace(/\s+/g, ' ').trim();
  return { text, i18n };
}

describe('聊天组件固定标签随界面语言即时重绘', () => {
  it('操作徽章切换语言后更新标签，历史名称保持原文', async () => {
    const action: MessageAction = {
      type: 'create',
      entity: 'term',
      name: '用户术语',
      timestamp: 1,
    };
    const { text, i18n } = mount(ChatActionBadge, {
      action,
      messageId: 'm',
      timestamp: 1,
      popoverKey: 'k',
      getChapterTitleForAction: () => undefined,
    });
    expect(text()).toContain('Create term');
    expect(text()).toContain('用户术语');
    i18n.global.locale.value = 'zh-TW';
    await nextTick();
    expect(text()).toContain('建立 術語');
    expect(text()).toContain('用户术语');
  });

  it('关键词搜索徽章按操作记录的执行语言解析章节标题', () => {
    const titleFor = vi.fn((_id: string | undefined, language?: string) =>
      language === 'en-US' ? 'Chapter One' : '第一话',
    );
    const { text } = mount(ChatActionBadge, {
      action: {
        type: 'read',
        entity: 'paragraph',
        tool_name: 'find_paragraph_by_keywords',
        keywords: ['勇者'],
        chapter_id: 'c1',
        language: 'en-US',
        timestamp: 0,
      } as MessageAction,
      getChapterTitleForAction: titleFor,
    });
    expect(titleFor).toHaveBeenCalledWith('c1', 'en-US');
    expect(text()).toContain('Chapter One');
  });

  it('批量替换徽章的计数说明本地化', () => {
    const { text } = mount(ChatBadgeTranslation, {
      kind: 'translation_batch_replace',
      action: { type: 'update', entity: 'translation', timestamp: 1 },
      extAction: { replaced_paragraph_count: 2, replaced_translation_count: 4 },
      getShortId: (v: string) => v,
      getTextPreview: (v: string) => v,
      getChapterTitleForAction: () => undefined,
    });
    expect(text()).toBe('Batch replaced 2 paragraphs (4 translation versions)');
  });

  it('组件内的复数文案按数量选择单复数形式', () => {
    const { text } = mount(ChatBadgeAsk, {
      kind: 'ask_user_batch',
      action: {
        type: 'ask',
        entity: 'user',
        timestamp: 1,
        batch_questions: ['问题'],
        batch_answers: [{ question_index: 0, answer: '答' }],
      },
      extAction: {},
      getShortId: (v: string) => v,
      getTextPreview: (v: string) => v,
      getChapterTitleForAction: () => undefined,
    });
    expect(text()).toBe('1 question → 1 answered');
  });

  it('总结气泡按语言显示，普通助手回复保持原文', async () => {
    const summary: ChatSessionMessage = {
      id: 's',
      role: 'assistant',
      content: SUMMARIZING_MESSAGE_CONTENT,
      timestamp: 1,
      isSummarization: true,
    };
    const handlers = {
      renderMarkdown: (value: string) => value,
      onGroupedActionHover: () => {},
      onActionHover: () => {},
      onGroupedActionLeave: () => {},
      onActionLeave: () => {},
      getChapterTitleForAction: () => undefined,
      formatMessageTime: () => '',
    };
    const { text, i18n } = mount(ChatMessageItem, {
      ...handlers,
      item: {
        type: 'content',
        content: summary.content,
        messageId: 's',
        messageRole: 'assistant',
        timestamp: 1,
      },
      message: summary,
      itemIdx: 0,
      itemCount: 1,
    });
    await vi.waitFor(() => expect(text()).toContain('Summarizing the conversation...'));
    i18n.global.locale.value = 'zh-CN';
    await vi.waitFor(() => expect(text()).toContain(SUMMARIZING_MESSAGE_CONTENT));
  });
});
