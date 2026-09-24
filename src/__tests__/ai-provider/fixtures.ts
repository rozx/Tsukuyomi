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
