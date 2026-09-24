import { parseJsonEventStream } from 'ai';
import { z } from 'zod';

const deltaSchema = z.looseObject({
  reasoning_content: z.string().nullish(),
  reasoning: z.string().nullish(),
  reasoning_details: z.array(z.looseObject({ text: z.string().optional() })).nullish(),
  tool_calls: z
    .array(
      z.looseObject({
        index: z.number().nullish(),
        id: z.string().nullish(),
        function: z.looseObject({ name: z.string().nullish(), arguments: z.string().nullish() }),
      }),
    )
    .nullish(),
});
const chunkSchema = z.looseObject({
  choices: z.array(z.looseObject({ delta: deltaSchema.nullish() })).optional(),
});

/** SDK 负责 SSE 解析；这里只补兼容端点缺失的字段，不解析或修复工具参数。 */
export function normalizeCompatibleStream(response: Response, toolCallOrder: string[]): Response {
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get('content-type')?.includes('text/event-stream')
  )
    return response;
  const calls = new Map<number | string, { id: string; name: string; arguments: string }>();
  let lastKey: number | string = 0;
  const encoder = new TextEncoder();
  const body = parseJsonEventStream({ stream: response.body, schema: chunkSchema }).pipeThrough(
    new TransformStream({
      transform(parsed, controller) {
        if (!parsed.success) throw parsed.error;
        const chunk = parsed.value;
        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta;
          if (!delta) continue;
          delta.reasoning_content =
            delta.reasoning_content ||
            delta.reasoning_details?.map((part) => part.text ?? '').join('') ||
            delta.reasoning;
          if (!delta.tool_calls) continue;
          delta.tool_calls = delta.tool_calls.flatMap((call) => {
            const key = call.index ?? call.id ?? lastKey;
            lastKey = key;
            let state = calls.get(key);
            if (!state) {
              state = { id: call.id || crypto.randomUUID(), name: '', arguments: '' };
              calls.set(key, state);
              toolCallOrder.push(state.id);
            }
            state.name = call.function.name || state.name;
            state.arguments += call.function.arguments ?? '';
            // 名称可能比参数更晚到达；直到名称出现才交给 SDK，最终仍无名的调用丢弃。
            if (!state.name.trim()) return [];
            const next = {
              ...call,
              id: state.id,
              function: { ...call.function, name: state.name, arguments: state.arguments },
            };
            state.arguments = '';
            return [next];
          });
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      },
      flush(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
