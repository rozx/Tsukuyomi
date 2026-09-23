import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { ImportAgentService } from '../services/import/import-agent-service';
import { ImportRepository } from '../services/import/import-repository';
import { AssistantService } from '../services/ai/tasks/assistant-service';
import { AIServiceFactory } from '../services/ai/ai-service-factory';
import type { AIModel } from '../services/ai/types/ai-model';
import type {
  AIServiceConfig,
  ChatMessage,
  TextGenerationRequest,
} from '../services/ai/types/ai-service';
import type { ImportCheckpoint } from '../models/import';
import { webLocksFixture } from './web-locks-fixture';
import { getDB } from '../utils/indexed-db';

const model = {
  id: 'm',
  name: '测试模型',
  provider: 'openai',
  model: 'test',
  apiKey: 'k',
  baseUrl: 'https://example.test',
  temperature: 0,
  maxInputTokens: 50000,
  maxOutputTokens: 2000,
  enabled: true,
  lastEdited: new Date(),
  isDefault: {
    translation: { enabled: false, temperature: 0 },
    proofreading: { enabled: false, temperature: 0 },
    termsTranslation: { enabled: false, temperature: 0 },
    assistant: { enabled: true, temperature: 0 },
  },
} as AIModel;

beforeEach(() => vi.stubGlobal('navigator', { locks: webLocksFixture() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const history: ChatMessage[] = [
  { role: 'system', content: '旧的系统提示' },
  { role: 'user', content: '请整理这些来源' },
  {
    role: 'assistant',
    content: '先检查来源。',
    tool_calls: [
      { id: 'c1', type: 'function', function: { name: 'inspect_source', arguments: '{}' } },
    ],
  },
  { role: 'tool', tool_call_id: 'c1', name: 'inspect_source', content: '{"success":true}' },
  { role: 'assistant', content: '已识别《测试小说》。' },
];

async function taskWith(checkpoint: Partial<ImportCheckpoint>) {
  const task = await ImportRepository.createTask();
  await (
    await getDB()
  ).put('import-tasks', {
    ...task,
    state: 'paused',
    checkpoint: { messages: [], remainingCalls: [], completedCallIds: [], ...checkpoint },
  });
  return task;
}

describe('导入对话压缩', () => {
  it('手动压缩把历史总结进检查点，清空旧消息并记录压缩事件', async () => {
    const task = await taskWith({ messages: history, summary: '更早的摘要' });
    const summarize = vi
      .spyOn(AssistantService, 'summarizeSession')
      .mockResolvedValue('用户要导入《测试小说》，已检查来源。');

    const result = await ImportAgentService.compact(task.id, model);

    const [, input, options] = summarize.mock.calls[0]!;
    expect(input.some((entry) => entry.content.includes('旧的系统提示'))).toBe(false);
    expect(input.some((entry) => entry.content.includes('请整理这些来源'))).toBe(true);
    expect(input.some((entry) => entry.content.includes('inspect_source'))).toBe(true);
    expect(options?.previousSummary).toBe('更早的摘要');
    expect(result.checkpoint).toMatchObject({
      messages: [],
      remainingCalls: [],
      summary: '用户要导入《测试小说》，已检查来源。',
    });
    expect(result.state).toBe('paused');
    expect(result.compacting).toBeUndefined();
    const events = (await ImportRepository.listEvents(task.id, { limit: 100 })).items;
    expect(events.filter((event) => event.kind === 'summary')).toHaveLength(1);
  });

  it('有未完成的工具调用或没有可压缩的对话时拒绝压缩，检查点不变', async () => {
    const summarize = vi.spyOn(AssistantService, 'summarizeSession').mockResolvedValue('摘要');
    const pending = await taskWith({
      messages: history,
      remainingCalls: [{ id: 'c2', name: 'ask_user', arguments: '{}' }],
    });
    await expect(ImportAgentService.compact(pending.id, model)).rejects.toThrow(
      'COMPACT_UNAVAILABLE',
    );
    const empty = await taskWith({ messages: [{ role: 'system', content: '提示' }] });
    await expect(ImportAgentService.compact(empty.id, model)).rejects.toThrow(
      'COMPACT_UNAVAILABLE',
    );
    expect(summarize).not.toHaveBeenCalled();
    expect((await ImportRepository.getTask(pending.id))?.checkpoint?.messages).toHaveLength(5);
  });

  it('总结失败时保留原历史并清除压缩中状态', async () => {
    const task = await taskWith({ messages: history });
    vi.spyOn(AssistantService, 'summarizeSession').mockRejectedValue(new Error('网络错误'));
    await expect(ImportAgentService.compact(task.id, model)).rejects.toThrow('网络错误');
    const saved = await ImportRepository.getTask(task.id);
    expect(saved?.checkpoint?.messages).toHaveLength(5);
    expect(saved?.compacting).toBeUndefined();
  });

  it('压缩后继续运行时系统提示带上摘要，不再重发旧消息', async () => {
    const task = await taskWith({ messages: history });
    vi.spyOn(AssistantService, 'summarizeSession').mockResolvedValue('摘要：测试小说');
    await ImportAgentService.compact(task.id, model);
    const requests: TextGenerationRequest[] = [];
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        requests.push(structuredClone(request));
        return Promise.resolve({ text: '继续整理。' });
      },
    } as never);
    await ImportAgentService.run(task.id, model, '继续');
    const messages = requests[0]!.messages!;
    expect(messages[0]!.content).toContain('摘要：测试小说');
    expect(JSON.stringify(messages)).not.toContain('请整理这些来源');
  });

  it('开始运行前历史接近上下文上限时自动压缩', async () => {
    const long: ChatMessage[] = [
      { role: 'user', content: '请整理' },
      { role: 'assistant', content: '内容'.repeat(3000) },
    ];
    const task = await taskWith({ messages: long });
    const summarize = vi.spyOn(AssistantService, 'summarizeSession').mockResolvedValue('自动摘要');
    const requests: TextGenerationRequest[] = [];
    vi.spyOn(AIServiceFactory, 'getService').mockReturnValue({
      generateText: (_config: AIServiceConfig, request: TextGenerationRequest) => {
        requests.push(structuredClone(request));
        return Promise.resolve({ text: '好的。' });
      },
    } as never);
    await ImportAgentService.run(task.id, { ...model, maxInputTokens: 8000 }, '继续');
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(requests[0]!.messages![0]!.content).toContain('自动摘要');
    const events = (await ImportRepository.listEvents(task.id, { limit: 100 })).items;
    expect(events.some((event) => event.kind === 'summary')).toBe(true);
  });

  it('运行中达到上下文上限而暂停时，压缩后自动继续一次', async () => {
    const task = await taskWith({ messages: history });
    const summarize = vi.spyOn(AssistantService, 'summarizeSession').mockResolvedValue('摘要');
    const chat = vi
      .spyOn(AssistantService, 'chat')
      .mockResolvedValueOnce({ text: '', actions: [], paused: 'context_limit' } as never)
      .mockResolvedValueOnce({ text: '完成', actions: [] } as never);
    await ImportAgentService.run(task.id, model, '继续');
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]![1]).toContain('继续');
  });
});
