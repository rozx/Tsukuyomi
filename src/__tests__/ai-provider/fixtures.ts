import { vi } from 'vitest';
import { ProxyService } from '../../services/proxy-service';
import type { AITool, AIServiceConfig } from '../../services/ai/types/ai-service';

export const config: AIServiceConfig = {
  apiKey: 'fixture-key',
  model: 'gemini-2.5-flash',
  useCorsProxy: false,
};

export const tools: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'read_book',
      description: '读取书籍',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
];

/** 每个事件独立入队，避免把整段响应误当成单个流块。 */
function sse(events: unknown[], done = false): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        if (done) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

export function openAIStream(deltas: Record<string, unknown>[], extra: unknown[] = []): Response {
  return sse(
    [
      ...deltas.map((delta) => ({
        id: 'chat-fixture',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'served-model',
        choices: [{ index: 0, delta, finish_reason: null }],
      })),
      {
        id: 'chat-fixture',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'served-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
      ...extra,
    ],
    true,
  );
}

export function geminiStream(parts: Record<string, unknown>[], extra: unknown[] = []): Response {
  return sse([
    ...parts.map((part) => ({
      candidates: [{ content: { role: 'model', parts: [part] }, index: 0 }],
    })),
    { candidates: [{ content: { role: 'model', parts: [] }, index: 0, finishReason: 'STOP' }] },
    ...extra,
  ]);
}

type AnthropicBlock =
  | { text: string }
  | { thinking: string; signature?: string }
  | { toolUse: { id: string; name: string; input: unknown } };

/** Anthropic Messages SSE：每个内容块按 start → delta → stop 发出；官方流总会报告用量。 */
export function anthropicStream(
  blocks: AnthropicBlock[],
  usage: { start?: Record<string, unknown>; end?: Record<string, unknown> } = {},
): Response {
  const events: unknown[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_fixture',
        type: 'message',
        role: 'assistant',
        model: 'served-model',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: usage.start ?? { input_tokens: 1, output_tokens: 1 },
      },
    },
  ];
  blocks.forEach((block, index) => {
    if ('text' in block) {
      events.push(
        { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } },
      );
    } else if ('thinking' in block) {
      events.push(
        {
          type: 'content_block_start',
          index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'thinking_delta', thinking: block.thinking },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'signature_delta', signature: block.signature ?? 'sig-fixture' },
        },
      );
    } else {
      events.push(
        {
          type: 'content_block_start',
          index,
          content_block: {
            type: 'tool_use',
            id: block.toolUse.id,
            name: block.toolUse.name,
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.toolUse.input) },
        },
      );
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push(
    {
      type: 'message_delta',
      delta: {
        stop_reason: blocks.some((block) => 'toolUse' in block) ? 'tool_use' : 'end_turn',
        stop_sequence: null,
      },
      usage: usage.end ?? { output_tokens: 1 },
    },
    { type: 'message_stop' },
  );
  return sse(events);
}

export function stubTransport() {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const responses: Response[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      headers: request.headers,
      body:
        request.method === 'GET'
          ? {}
          : (JSON.parse(await request.text()) as Record<string, unknown>),
    });
    const response = responses.shift();
    if (!response) throw new Error('Fixture 没有准备响应');
    return response;
  });
  vi.stubGlobal('fetch', fetch);
  const proxy = vi.spyOn(ProxyService, 'getProxiedUrlForAI').mockImplementation((url) => url);
  return { requests, responses, fetch, proxy };
}
