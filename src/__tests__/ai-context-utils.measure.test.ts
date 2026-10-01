import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureAssistantContext, buildAssistantMessageHistory } from '../utils/ai-context-utils';
import { createContextAnchor, modelContextKey } from '../services/ai/context/measure';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import { getAssistantSystemPrompt } from '../services/ai/tasks/prompts/assistant';
import { getTodosSystemPrompt } from '../services/ai/tasks/utils/todo-helper';
import type { ChatSession } from '../stores/chat-sessions';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import { agentText } from '../i18n/translate';
import type { AIModel } from '../services/ai/types/ai-model';
const model = {
  id: 'meter-model',
  model: 'model',
  provider: 'openai',
  baseUrl: 'https://fixture.test',
} as AIModel;
const context = { currentBookId: null, currentChapterId: null, selectedParagraphId: null };
const session = (): ChatSession => ({
  id: 'meter-session',
  title: '测试',
  createdAt: 1,
  updatedAt: 1,
  lastSummarizedMessageIndex: 0,
  context: { bookId: null, chapterId: null, paragraphId: null },
  messages: [{ id: '1', role: 'user', content: '旧问题', timestamp: 1 }],
  apiMessageHistory: [{ role: 'user', content: '旧问题' }],
});
const cn = captureExecutionLanguages('zh-CN');
afterEach(() => vi.restoreAllMocks());
describe('助手用量与服务端使用同一份请求上下文', () => {
  it('重建持久化工具历史保留 null、reasoning 与厂商元数据，锚点继续有效', () => {
    vi.spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockReturnValue([]);
    const current = session();
    current.apiMessageHistory = [
      { role: 'user', content: '旧问题' },
      {
        role: 'assistant',
        content: null,
        reasoning_content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'read', arguments: '{}' },
            providerMetadata: { google: { thoughtSignature: 's1' } },
          },
        ],
      },
      { tool_call_id: 'c1', role: 'tool', name: 'read', content: '工具结果' },
    ];
    current.messages.push({ id: '2', role: 'assistant', content: '调用已完成', timestamp: 2 });
    current.contextAnchor = createContextAnchor(
      {
        systemPrompt: getAssistantSystemPrompt(getTodosSystemPrompt(true), [], context),
        tools: [],
        history: current.apiMessageHistory,
        modelKey: modelContextKey(model),
      },
      42000,
    )!;
    expect(buildAssistantMessageHistory(current)).toEqual(current.apiMessageHistory);
    expect(
      measureAssistantContext(
        { context, session: current, currentMessages: current.messages, languages: cn },
        model,
      ),
    ).toEqual({ tokens: 42000, estimated: false });
  });
  it('按执行语言构建统计用提示词与摘要，英文会话锚点保持有效', () => {
    const tools = vi
      .spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement')
      .mockReturnValue([]);
    const en = captureExecutionLanguages('en-US');
    const current = session();
    current.summary = 'Earlier work';
    current.contextAnchor = createContextAnchor(
      {
        systemPrompt:
          getAssistantSystemPrompt(getTodosSystemPrompt(true), [], context, en) +
          '\n\n' +
          agentText('aiAssistant.summaryWrap', { summary: 'Earlier work' }),
        history: current.apiMessageHistory!,
        tools: [],
        modelKey: modelContextKey(model),
      },
      42000,
    )!;
    expect(
      measureAssistantContext(
        { context, session: current, currentMessages: current.messages, languages: en },
        model,
      ),
    ).toEqual({ tokens: 42000, estimated: false });
    // 工具声明与界面语言无关
    expect(tools).toHaveBeenCalledWith(undefined);
  });
  it('有效实测锚点直接显示实测值，不重复加工具开销', () => {
    vi.spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement').mockReturnValue([]);
    const current = session();
    current.contextAnchor = createContextAnchor(
      {
        systemPrompt: getAssistantSystemPrompt(getTodosSystemPrompt(true), [], context),
        history: current.apiMessageHistory!,
        tools: [],
        modelKey: modelContextKey(model),
      },
      42000,
    )!;
    expect(
      measureAssistantContext(
        { context, session: current, currentMessages: current.messages, languages: cn },
        model,
      ),
    ).toEqual({ tokens: 42000, estimated: false });
    const legacy = { ...current, toolCallTokenOverhead: 500000 };
    expect(
      measureAssistantContext(
        { context, session: legacy, currentMessages: legacy.messages, languages: cn },
        model,
      ),
    ).toEqual({ tokens: 42000, estimated: false });
  });
  it('旧会话 fallback 不恢复废弃 overhead，新的 pending user 计入估算', () => {
    const current = session();
    delete current.apiMessageHistory;
    const base = measureAssistantContext(
      { context, session: current, currentMessages: current.messages, languages: cn },
      model,
    );
    const legacy = { ...current, toolCallTokenOverhead: 500000 };
    expect(
      measureAssistantContext(
        { context, session: legacy, currentMessages: legacy.messages, languages: cn },
        model,
      ),
    ).toEqual(base);
    const pending = [
      ...current.messages,
      { id: '2', role: 'user' as const, content: '新增请求内容'.repeat(30), timestamp: 2 },
    ];
    expect(
      measureAssistantContext(
        { context, session: current, currentMessages: pending, languages: cn },
        model,
      ).tokens,
    ).toBeGreaterThan(base.tokens);
    expect(base.estimated).toBe(true);
  });
});
