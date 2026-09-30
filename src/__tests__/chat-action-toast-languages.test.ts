import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useChatActionHandler } from '../composables/chat/useChatActionHandler';
import { useContextStore } from '../stores/context';
import { useSettingsStore } from '../stores/settings';
import type { ActionInfo } from '../services/ai/tools/types';
import type { AppLocale } from '../models/locale';
import type { Terminology } from '../models/novel';
import type { ChatSessionMessage, MessageAction } from '../stores/chat-sessions';

const CJK = /[㐀-鿿]/;
const revision = { counter: 1, actorId: 'a' };

const term = {
  id: 't1',
  name: 'ゆうしゃ',
  translation: { id: 'z', translation: '勇者', aiModelId: 'm' },
  translationsByLanguage: {
    'zh-CN': { value: { id: 'z', translation: '勇者', aiModelId: 'm' }, revision, updatedAt: 1 },
    'en-US': { value: { id: 'e', translation: 'Hero', aiModelId: 'm' }, revision, updatedAt: 1 },
  },
} as unknown as Terminology;

function setup() {
  const add = vi.fn();
  const handler = useChatActionHandler(
    { push: vi.fn() } as never,
    { add },
    () => {},
    () => {},
    ref<ChatSessionMessage[]>([{ id: 'm', role: 'assistant', content: '', timestamp: 0 }]),
    ref<MessageAction[]>([]),
    () => {},
    () => 0,
  );
  return { add, handle: (a: ActionInfo) => handler.handleAction(a, { value: 'm' }) };
}

function execution(uiLocale: AppLocale, targetLanguage: AppLocale) {
  return { bookId: 'b1', languages: { uiLocale, targetLanguage } };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('聊天操作 toast 使用执行快照的界面语言', () => {
  it('英文界面创建术语：固定标签为英文，译名取执行目标语言槽', () => {
    const { add, handle } = setup();
    handle({ type: 'create', entity: 'term', data: term, execution: execution('en-US', 'en-US') });
    const toast = add.mock.calls[0]![0];
    expect(toast.summary).toBe('Create term');
    expect(toast.detail).toBe('ゆうしゃ → Hero');
  });

  it('简中界面保持原有文案', () => {
    const { add, handle } = setup();
    handle({ type: 'create', entity: 'term', data: term, execution: execution('zh-CN', 'zh-CN') });
    const toast = add.mock.calls[0]![0];
    expect(toast.summary).toBe('创建术语');
    expect(toast.detail).toBe('ゆうしゃ → 勇者');
  });

  it('批量替换翻译 toast 在英文界面不含中文固定文字', () => {
    const { add, handle } = setup();
    handle({
      type: 'update',
      entity: 'translation',
      data: {
        tool_name: 'batch_replace_translations',
        replaced_paragraph_count: 2,
        replaced_translation_count: 3,
        replacement_text: 'Hero',
        replace_all_translations: false,
        keywords: ['Hero'],
      },
      execution: execution('en-US', 'en-US'),
    } as unknown as ActionInfo);
    const toast = add.mock.calls[0]![0];
    expect(toast.summary).toBe('Batch replace translations');
    expect(toast.detail).toContain('Batch replaced 2 paragraphs (3 translation versions)');
    expect(CJK.test(`${toast.summary}${toast.detail}`)).toBe(false);
  });

  it('没有执行快照时使用当前界面语言', () => {
    useSettingsStore().settings.uiLocale = 'zh-TW';
    useContextStore().setCurrentBook('b1');
    const { add, handle } = setup();
    handle({ type: 'delete', entity: 'book', data: { name: '用户书名' } } as unknown as ActionInfo);
    const toast = add.mock.calls[0]![0];
    expect(toast.summary).toBe('刪除書籍');
    expect(toast.detail).toBe('書籍 "用户书名" 已刪除');
  });
});
