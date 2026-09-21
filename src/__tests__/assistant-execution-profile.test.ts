import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { AssistantExecution } from '../services/ai/tasks/utils/assistant-execution';
import type {
  AssistantExecutionCheckpoint,
  AssistantExecutionProfile,
} from '../services/ai/tasks/utils/assistant-execution';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import { useContextStore } from '../stores/context';
import { BookExecutionGuard } from '../services/book-execution-guard';
import { BookService } from '../services/book-service';
import { book } from './import-fixtures';
import { deferred, webLocksFixture } from './web-locks-fixture';
import type { AIModel } from '../services/ai/types/ai-model';
import type {
  AITool,
  AIToolCall,
  AIServiceConfig,
  TextGenerationRequest,
} from '../services/ai/types/ai-service';

const model: AIModel = {
  id: 'import-model',
  name: '导入模型',
  provider: 'openai',
  model: 'test',
  temperature: 0.2,
  maxInputTokens: 20000,
  maxOutputTokens: 1000,
  apiKey: 'test-only-key',
  baseUrl: 'https://example.test',
  enabled: true,
  lastEdited: new Date(),
  isDefault: {
    translation: { enabled: false, temperature: 0 },
    proofreading: { enabled: false, temperature: 0 },
    termsTranslation: { enabled: false, temperature: 0 },
    assistant: { enabled: true, temperature: 0.2 },
  },
};
const tool = (name: string): AITool => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
});
const call = (name: string, id = name): AIToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: '{}' },
});
const result = (entry: AIToolCall) => ({
  role: 'tool' as const,
  name: entry.function.name,
  tool_call_id: entry.id,
  content: '{"success":true}',
});

function profile(overrides: Partial<AssistantExecutionProfile> = {}) {
  let checkpoint: AssistantExecutionCheckpoint | undefined;
  const config: AssistantExecutionProfile = {
    context: {
      currentBookId: null,
      currentChapterId: null,
      hoveredParagraphId: null,
      selectedParagraphId: null,
    },
    tools: [tool('inspect_source'), tool('ask_user'), tool('extract_content')],
    systemPrompt: () => Promise.resolve('导入专用系统提示词'),
    saveCheckpoint: (value) => {
      checkpoint = structuredClone(value);
      return Promise.resolve();
    },
    executeTool: (entry) => Promise.resolve({ result: result(entry) }),
    ...overrides,
  };
  return { config, saved: () => checkpoint };
}
function mockModel(
  generate: (request: TextGenerationRequest) => Promise<{ text: string; toolCalls?: AIToolCall[] }>,
) {
  return vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
    generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => generate(request),
  } as never);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('复用助手循环的专属执行配置', () => {
  it('普通助手拥有书库写工具时持有目标占用，纯只读工具不阻塞导入', async () => {
    vi.stubGlobal('navigator', { locks: webLocksFixture() });
    await BookService.saveBook(book());
    useContextStore().setCurrentBook('book');
    const tools = vi
      .spyOn(ToolRegistry, 'getAssistantToolsExcludingTranslationManagement')
      .mockReturnValue([tool('update_translation')]);
    const started = deferred();
    const finished = deferred();
    mockModel(async () => {
      started.resolve();
      await finished.promise;
      return { text: '助手完成' };
    });
    const running = AssistantService.chat(model, '修改译文');
    await started.promise;
    try {
      await expect(BookExecutionGuard.commit('book', () => Promise.resolve())).rejects.toThrow(
        'TARGET_BUSY',
      );
    } finally {
      finished.resolve();
      await running;
    }
    const acquired = deferred();
    const release = deferred();
    const importing = BookExecutionGuard.commit('book', async () => {
      acquired.resolve();
      await release.promise;
    });
    await acquired.promise;
    tools.mockReturnValue([tool('get_book_info')]);
    try {
      await expect(AssistantService.chat(model, '读取信息')).resolves.toMatchObject({
        text: '助手完成',
      });
    } finally {
      release.resolve();
      await importing;
    }
  });

  it('取消在途工具保留未完成检查点，不继续分派后续调用', async () => {
    const controller = new AbortController();
    const execute = vi.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException('取消', 'AbortError'));
    });
    const custom = profile({ executeTool: execute });
    mockModel(() =>
      Promise.resolve({ text: '', toolCalls: [call('inspect_source'), call('extract_content')] }),
    );
    const response = await AssistantService.chat(model, '检查', {
      execution: new AssistantExecution(custom.config),
      signal: controller.signal,
    });
    expect(response.paused).toBe('user');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(custom.saved()?.remainingCalls).toHaveLength(2);
    expect(custom.saved()?.completedCallIds).toEqual([]);
  });

  it('无法容纳上下文时保存并暂停，不发送超限请求', async () => {
    const custom = profile();
    const generate = vi.fn(() => Promise.resolve({ text: '不应调用' }));
    mockModel(generate);
    const response = await AssistantService.chat(
      { ...model, maxInputTokens: 50 },
      '长原文'.repeat(500),
      { execution: new AssistantExecution(custom.config) },
    );
    expect(response.paused).toBe('context_limit');
    expect(custom.saved()?.messages.some((message) => message.role === 'user')).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it('循环内摘要沿用共享策略，后续请求仍使用专属提示词及工具', async () => {
    const summary = '已检查前面的来源并保存完整工具结果，后续需要继续整理章节。'.repeat(4);
    const custom = profile({
      systemPrompt: (value) => Promise.resolve(`导入提示词：${value ?? '尚无摘要'}`),
      executeTool: (entry) =>
        Promise.resolve({ result: { ...result(entry), content: '大量上下文 '.repeat(30000) } }),
    });
    const requests: TextGenerationRequest[] = [];
    mockModel((request) => {
      requests.push(structuredClone(request));
      return Promise.resolve(
        requests.length === 1
          ? { text: '', toolCalls: [call('inspect_source')] }
          : { text: requests.length === 2 ? summary : '整理完成' },
      );
    });
    const response = await AssistantService.chat(model, '整理', {
      execution: new AssistantExecution(custom.config),
    });
    expect(requests).toHaveLength(3);
    expect(response.text).toBe('整理完成');
    expect(requests[2]?.messages?.[0]?.content).toContain(summary);
    expect(requests[2]?.tools).toEqual(custom.config.tools);
    expect(custom.saved()?.summary).toContain(summary);
  });

  it('显式上下文、提示词和工具取代全局书籍绑定，拒绝未暴露工具', async () => {
    useContextStore().setCurrentBook('unrelated-book');
    const ordinary = vi.spyOn(ToolRegistry, 'handleToolCall');
    const invoked: string[] = [];
    const custom = profile({
      executeTool: (entry) => {
        invoked.push(entry.function.name);
        return Promise.resolve({ result: result(entry) });
      },
    });
    const requests: TextGenerationRequest[] = [];
    mockModel((request) => {
      requests.push(structuredClone(request));
      return Promise.resolve(
        requests.length === 1
          ? { text: '', toolCalls: [call('inspect_source'), call('apply_import')] }
          : { text: '已整理候选' },
      );
    });
    const response = await AssistantService.chat(model, '检查来源', {
      execution: new AssistantExecution(custom.config),
    });
    expect(response.text).toBe('已整理候选');
    expect(invoked).toEqual(['inspect_source']);
    expect(ordinary).not.toHaveBeenCalled();
    expect(requests[0]?.messages?.[0]?.content).toBe('导入专用系统提示词');
    expect(requests[0]?.tools).toEqual(custom.config.tools);
    expect(custom.saved()?.remainingCalls).toEqual([]);
    expect(JSON.stringify(custom.saved())).not.toContain('test-only-key');
    expect(useContextStore().currentBookId).toBe('unrelated-book');
  });

  it('批内提问让出后，只恢复当前及后续调用，再继续同一助手循环', async () => {
    const invoked: string[] = [];
    const custom = profile({
      executeTool: (entry) => {
        invoked.push(entry.function.name);
        return Promise.resolve(
          entry.function.name === 'ask_user'
            ? { pause: 'waiting_user' }
            : { result: result(entry) },
        );
      },
    });
    const generate = vi.fn(() =>
      Promise.resolve({
        text: '',
        toolCalls: [call('inspect_source'), call('ask_user'), call('extract_content')],
      }),
    );
    mockModel(generate);
    const paused = await AssistantService.chat(model, '导入', {
      execution: new AssistantExecution(custom.config),
    });
    expect(paused.paused).toBe('waiting_user');
    expect(invoked).toEqual(['inspect_source', 'ask_user']);
    const saved = custom.saved()!;
    expect(saved.remainingCalls.map((entry) => entry.function.name)).toEqual([
      'ask_user',
      'extract_content',
    ]);
    expect(saved.completedCallIds).toHaveLength(1);
    generate.mockImplementation(() => {
      expect(invoked).toEqual(['inspect_source', 'ask_user', 'ask_user', 'extract_content']);
      return Promise.resolve({ text: '继续完成', toolCalls: [] });
    });
    const resumed = new AssistantExecution({
      ...custom.config,
      resume: saved,
      executeTool: (entry) => {
        invoked.push(entry.function.name);
        return Promise.resolve({ result: result(entry) });
      },
    });
    const finished = await AssistantService.chat(model, '', { execution: resumed });
    expect(finished.text).toBe('继续完成');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(custom.saved()?.completedCallIds).toHaveLength(3);
  });

  it('达到工具轮次上限保留未执行调用，不伪造失败结果或宣称完成', async () => {
    const custom = profile({ maxToolTurns: 1 });
    let requests = 0;
    mockModel(() =>
      Promise.resolve({
        text: '',
        toolCalls: [
          call(++requests === 1 ? 'inspect_source' : 'extract_content', 'provider-reuses-id'),
        ],
      }),
    );
    const response = await AssistantService.chat(model, '导入', {
      execution: new AssistantExecution(custom.config),
    });
    expect(response.paused).toBe('tool_limit');
    const saved = custom.saved()!;
    expect(saved.remainingCalls).toHaveLength(1);
    expect(saved.completedCallIds).toHaveLength(1);
    expect(saved.remainingCalls[0]?.id).not.toBe(saved.completedCallIds[0]);
    expect(saved.messages.filter((message) => message.role === 'tool')).toHaveLength(1);
  });

  it('不完整 JSON 不进入持久检查点，也不执行半个工具参数', async () => {
    const execute = vi.fn((entry: AIToolCall) => Promise.resolve({ result: result(entry) }));
    const custom = profile({ executeTool: execute });
    mockModel(() =>
      Promise.resolve({
        text: '',
        toolCalls: [
          {
            ...call('inspect_source'),
            function: { name: 'inspect_source', arguments: '{"source_id":' },
          },
        ],
      }),
    );
    await expect(
      AssistantService.chat(model, '检查', { execution: new AssistantExecution(custom.config) }),
    ).rejects.toThrow('INCOMPLETE_TOOL_CALL');
    expect(execute).not.toHaveBeenCalled();
    expect(custom.saved()?.remainingCalls).toEqual([]);
  });
});
