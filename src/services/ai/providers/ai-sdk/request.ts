import { ProxyService } from 'src/services/proxy-service';
import { APICallError } from 'ai';
import type { TextGenerationRequest } from 'src/services/ai/types/ai-service';
import { providerError } from 'src/services/ai/providers/ai-sdk/errors';

interface WireMessage {
  role?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; function?: { name: string; arguments: string } }[];
}

export function transformOpenAIRequest(request: TextGenerationRequest) {
  const calls = new Map(
    request.messages?.flatMap(
      (message) =>
        message.tool_calls?.map(
          (call) =>
            [
              call.id,
              {
                call,
                reasoning: message.reasoning_content ?? null,
              },
            ] as const,
        ) ?? [],
    ) ?? [],
  );
  const names = new Map(
    request.messages
      ?.filter((message) => message.role === 'tool')
      .map((message) => [message.tool_call_id, message.name]) ?? [],
  );
  return (body: Record<string, unknown>): Record<string, unknown> => {
    const result = { ...body };
    if (Array.isArray(body.tools) && body.tools.length) result.tool_choice = 'auto';
    if (typeof body.max_tokens === 'number' && body.max_tokens > 0) {
      result.max_tokens = Math.max(1, Math.min(body.max_tokens, 65536));
    } else delete result.max_tokens;
    if (Array.isArray(body.messages)) {
      result.messages = (body.messages as WireMessage[]).map((message) => {
        if (message.role === 'assistant' && message.tool_calls?.length) {
          return {
            ...message,
            reasoning_content: calls.get(message.tool_calls[0]!.id)?.reasoning ?? null,
            tool_calls: message.tool_calls.map((call) => ({
              ...call,
              function: calls.get(call.id)?.call.function ?? call.function,
            })),
          };
        }
        const name =
          names.get(message.tool_call_id) ??
          calls.get(message.tool_call_id ?? '')?.call.function.name;
        return message.role === 'tool' && name ? { ...message, name } : message;
      });
    }
    return result;
  };
}

export function createProxyFetch(
  useCorsProxy?: boolean,
  transformResponse?: (response: Response) => Response,
): typeof fetch {
  // SDK 只调用 fetch；Bun 的全局类型额外声明了浏览器不存在的 preconnect。
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const proxied = ProxyService.getProxiedUrlForAI(url, useCorsProxy);
    let response: Response;
    try {
      response = await fetch(
        input instanceof Request ? new Request(proxied, input) : proxied,
        init,
      );
    } catch (error) {
      // 浏览器的连接失败通常只有 TypeError，没有 Node 的 cause.code。
      if (
        error instanceof TypeError &&
        /failed to fetch|fetch failed|networkerror|load failed/i.test(error.message)
      ) {
        throw new APICallError({
          message: error.message,
          url,
          requestBodyValues: undefined,
          cause: error,
          isRetryable: true,
        });
      }
      throw error;
    }
    // SDK 默认还重试 408/409；应用契约只允许 429、5xx 与连接错误重试。
    if (response.status === 408 || response.status === 409) {
      throw providerError(
        new APICallError({
          message: response.statusText,
          url,
          requestBodyValues: undefined,
          statusCode: response.status,
          responseBody: await response.text(),
          isRetryable: false,
        }),
      );
    }
    return transformResponse ? transformResponse(response) : response;
  }) as typeof fetch;
}
