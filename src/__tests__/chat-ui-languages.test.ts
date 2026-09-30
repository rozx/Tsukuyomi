import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { nextTick, ref } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useChatSessionsStore, type ChatSessionMessage } from '../stores/chat-sessions';
import { useChatComposerState } from '../composables/right-panel/useChatComposerState';
import { describeChatContext } from '../composables/right-panel/useRightPanel';
import { useChatSending } from '../composables/chat/useChatSending';
import { useInternalSummarization } from '../composables/chat/useInternalSummarization';
import {
  SUMMARIZING_MESSAGE_CONTENT,
  chatMessageDisplayContent,
} from '../composables/chat/constants';
import { DEFAULT_SESSION_TITLE, sessionDisplayTitle } from '../constants/chat';
import { AssistantService } from '../services/ai/tasks';
import { LocalizedError } from '../utils/localized-error';
import type { AIModel } from '../services/ai/types/ai-model';
import type { Chapter, Novel } from '../models/novel';

const CJK = /[㐀-鿿]/;

beforeEach(() => {
  useSettingsStore().settings.uiLocale = 'en-US';
});
afterEach(() => vi.restoreAllMocks());

describe('聊天输入栏固定文字随界面语言重绘', () => {
  it('切换界面语言后状态、占位与发送按钮文字立即更新', async () => {
    const composer = useChatComposerState({
      assistantModel: ref({ id: 'gpt', name: 'GPT' } as AIModel),
      isSending: ref(false),
      inputMessage: ref(''),
      sendMessage: () => {},
      stopGeneration: () => {},
      sendClassPrefix: 'cp-send',
      readyPlaceholderKey: 'activityUi.chat.placeholderDesktop',
    });
    expect(composer.assistantStatusText.value).toBe('GPT · Online');
    expect(composer.inputPlaceholder.value).toBe('Ask Tsukuyomi… (Shift+Enter for a new line)');
    expect(composer.sendButton.value.ariaLabel).toBe('Send');

    useSettingsStore().settings.uiLocale = 'zh-CN';
    await nextTick();
    expect(composer.assistantStatusText.value).toBe('GPT · 在线');
    expect(composer.inputPlaceholder.value).toBe('请月詠相助… (Shift+Enter 换行)');
    expect(composer.sendButton.value.ariaLabel).toBe('发送');
  });

  it('未配置模型时的提示也按界面语言显示', () => {
    useSettingsStore().settings.uiLocale = 'zh-TW';
    const composer = useChatComposerState({
      assistantModel: ref<AIModel | undefined>(undefined),
      isSending: ref(true),
      inputMessage: ref(''),
      sendMessage: () => {},
      stopGeneration: () => {},
      sendClassPrefix: 'mc-send',
      readyPlaceholderKey: 'activityUi.chat.placeholder',
    });
    expect(composer.assistantStatusText.value).toBe('未設定助手模型');
    expect(composer.sendButton.value.ariaLabel).toBe('停止');
  });
});

describe('聊天上下文说明', () => {
  const chapter = { id: 'c1', title: '第一章', content: [{ id: 'p1' }, { id: 'p2' }] } as Chapter;
  const book = {
    id: 'b1',
    title: '用户书名',
    volumes: [{ id: 'v', chapters: [chapter] }],
  } as Novel;

  it('固定前缀按界面语言，书名原样保留', () => {
    const parts = {
      bookId: 'b1',
      book,
      chapterId: 'c1',
      chapter,
      paragraphId: 'p2',
    };
    expect(describeChatContext(parts, 'en-US')).toBe(
      'Book: 用户书名 | Chapter: 第一章 | Paragraph: #2',
    );
    expect(describeChatContext(parts, 'zh-CN')).toBe('书籍：用户书名 | 章节：第一章 | 段落：#2');
  });

  it('没有上下文时返回空字符串，由界面决定是否显示', () => {
    expect(describeChatContext({ bookId: null, chapterId: null, paragraphId: null }, 'en-US')).toBe(
      '',
    );
  });
});

describe('系统生成的聊天气泡与会话标题', () => {
  it('总结气泡仍存简中哨兵，显示时按界面语言渲染', () => {
    const messages = ref<ChatSessionMessage[]>([]);
    const summarization = useInternalSummarization(messages, () => {}, useChatSessionsStore());
    summarization.handleSummarizingStart({ value: 'x' }, undefined);
    const bubble = messages.value[0]!;
    expect(bubble.content).toBe(SUMMARIZING_MESSAGE_CONTENT);
    expect(chatMessageDisplayContent(bubble, 'en-US')).toBe('Summarizing the conversation...');

    summarization.handleSummarizingEnd({ value: 'x' });
    const done = messages.value[0]!;
    expect(chatMessageDisplayContent(done, 'en-US')).toBe('📝 Conversation summarized');
    expect(chatMessageDisplayContent(done, 'zh-CN')).toBe('📝 已完成对话总结');
  });

  it('助手与用户的自由文本不被重译', () => {
    const message: ChatSessionMessage = {
      id: 'm',
      role: 'assistant',
      content: '聊天正在总结中...',
      timestamp: 0,
    };
    expect(chatMessageDisplayContent(message, 'en-US')).toBe('聊天正在总结中...');
  });

  it('默认会话标题显示为当前语言，用户标题原样显示', () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: null, chapterId: null, paragraphId: null });
    expect(store.currentSession?.title).toBe(DEFAULT_SESSION_TITLE);
    expect(sessionDisplayTitle(DEFAULT_SESSION_TITLE, 'en-US')).toBe('New chat');
    expect(sessionDisplayTitle('用户的问题', 'en-US')).toBe('用户的问题');
  });
});

describe('聊天发送反馈', () => {
  const model = { id: 'm', name: 'M', enabled: true } as AIModel;
  function build(messages: ChatSessionMessage[], assistantModel?: AIModel) {
    const toast = { add: vi.fn() };
    const sending = useChatSending(
      ref(messages),
      ref('hi'),
      ref(assistantModel),
      () => {},
      () => {},
      { getMessagesSinceSummaryCount: () => 0 } as never,
      {
        setThinkingActive: () => {},
        setDisplayedThinkingImmediatelyIfEmpty: () => {},
        updateDisplayedThinkingProcess: () => {},
        markThinkingActive: () => {},
        thinkingExpanded: ref(new Map()),
        requestScrollThinkingToBottom: () => {},
      },
      { push: vi.fn() } as never,
      toast,
      ref([]),
      () => {},
      ref(null),
    );
    return { sending, toast };
  }

  it('未配置模型的提示为英文', async () => {
    const { sending, toast } = build([]);
    await sending.sendMessage();
    const payload = toast.add.mock.calls[0]![0];
    expect(payload.summary).toBe('Select an AI model');
    expect(CJK.test(payload.detail)).toBe(false);
  });

  it('消息数达上限的提示为英文', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: 'x',
      timestamp: i,
    }));
    const { sending, toast } = build(many, model);
    await sending.sendMessage();
    expect(toast.add.mock.calls[0]![0]).toMatchObject({
      summary: 'This chat has reached the message limit',
      detail: 'Start a new chat to continue',
    });
  });

  it('自有保存失败错误按界面语言显示', async () => {
    const store = useChatSessionsStore();
    store.createSession({ bookId: null, chapterId: null, paragraphId: null });
    vi.spyOn(AssistantService, 'chat').mockResolvedValue({ text: 'ok', messageHistory: [] });
    vi.spyOn(store, 'saveChatResult').mockImplementation(() => {
      throw new LocalizedError('CHAT_CONTEXT_SAVE_FAILED', 'activityUi.chat.saveContextFailed');
    });
    const { sending, toast } = build([], model);
    await sending.sendMessage();
    const payload = toast.add.mock.calls.find((c) => c[0].severity === 'error')![0];
    expect(payload.summary).toBe('Could not send');
    expect(payload.detail).toContain('Could not save the chat context');
  });
});
