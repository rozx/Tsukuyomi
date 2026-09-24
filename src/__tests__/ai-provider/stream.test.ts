import '../setup';
import { describe, expect, it } from 'bun:test';
import type { TextStreamPart, ToolSet } from 'ai';
import type { TextGenerationChunk } from '../../services/ai/types/ai-service';
import { collectStream } from '../../services/ai/providers/ai-sdk/stream';

async function* events(parts: TextStreamPart<ToolSet>[]) {
  for (const part of parts) yield await Promise.resolve(part);
}

describe('AI SDK 流收集边界', () => {
  it('没有参数 delta 时从 tool-call 兜底，携带元数据并只发一次完成通知', async () => {
    const chunks: TextGenerationChunk[] = [];
    const result = await collectStream(
      events([
        {
          type: 'tool-call',
          toolCallId: 'a',
          toolName: 'read_book',
          input: { id: 'a' },
          providerMetadata: { google: { thoughtSignature: 'signed' } },
        },
      ]),
      { modelId: 'fixture' },
      (chunk) => {
        chunks.push(chunk);
      },
    );
    expect(result.toolCalls).toEqual([
      {
        id: 'a',
        type: 'function',
        function: { name: 'read_book', arguments: '{"id":"a"}' },
        providerMetadata: { google: { thoughtSignature: 'signed' } },
      },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ done: true, toolCalls: result.toolCalls });
  });

  it('已收到原始参数时不以 SDK 的解析结果覆盖，保留格式及截断信息', async () => {
    const result = await collectStream(
      events([
        { type: 'tool-input-start', id: 'a', toolName: 'read_book' },
        { type: 'tool-input-delta', id: 'a', delta: '{ "id": "半截' },
        { type: 'tool-call', toolCallId: 'a', toolName: 'read_book', input: { id: '半截' } },
      ]),
      { modelId: 'fixture' },
    );
    expect(result.toolCalls?.[0]?.function.arguments).toBe('{ "id": "半截');
  });
});
