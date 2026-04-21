import { jsonrepair } from 'jsonrepair';
import type { AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ActionInfo, ChunkBoundaries, ToolContext, ToolDefinition } from './types';
import type { ToastCallback } from './toast-helper';

const ARGS_PREVIEW_LIMIT = 200;

/**
 * handleToolCall 的可选字段。所有都是 optional，未提供的字段不会传递给 tool.handler。
 */
export interface HandleToolCallOptions {
  bookId: string;
  onAction?: (action: ActionInfo) => void;
  onToast?: ToastCallback;
  taskId?: string;
  sessionId?: string;
  paragraphIds?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiProcessingStore?: any;
  aiModelId?: string;
  chunkIndex?: number;
  submittedParagraphIds?: Set<string>;
  accumulatedParagraphs?: Map<string, string>;
  enableOriginalTextValidation?: boolean;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * 预览工具参数/结果，用于日志输出。字符串直接截断，其他类型先 JSON.stringify。
 */
function previewForLog(value: unknown, maxLength = ARGS_PREVIEW_LIMIT): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return truncate(str, maxLength);
}

/**
 * 解析工具参数；JSON.parse 失败时尝试 jsonrepair 修复常见格式问题。
 */
function parseToolCallArguments(
  rawArgs: string,
  functionName: string,
): Record<string, unknown> {
  try {
    return JSON.parse(rawArgs);
  } catch (e) {
    try {
      const repairedJson = jsonrepair(rawArgs);
      const parsed = JSON.parse(repairedJson);
      console.log(`[ToolRegistry] 🔧 使用 jsonrepair 修复了格式错误的 JSON [${functionName}]`);
      return parsed;
    } catch {
      const errorMsg = `无法解析工具参数: ${e instanceof Error ? e.message : String(e)}`;
      console.error(
        `[ToolRegistry] ❌ 工具调用失败 [${functionName}]:`,
        errorMsg,
        '\n原始参数:',
        rawArgs,
      );
      throw new Error(errorMsg);
    }
  }
}

/**
 * 根据 paragraphIds 构建 chunk 边界；若未提供或为空则返回 undefined。
 */
function buildChunkBoundaries(
  paragraphIds: string[] | undefined,
): ChunkBoundaries | undefined {
  if (!paragraphIds || paragraphIds.length === 0) return undefined;
  return {
    allowedParagraphIds: new Set(paragraphIds),
    paragraphIds,
    firstParagraphId: paragraphIds[0]!,
    lastParagraphId: paragraphIds[paragraphIds.length - 1]!,
  };
}

/**
 * 组装传给 tool.handler 的 context；只包含已提供的可选字段（避免传 undefined）。
 */
function buildToolHandlerContext(options: HandleToolCallOptions): ToolContext {
  const chunkBoundaries = buildChunkBoundaries(options.paragraphIds);
  const context: ToolContext = {};

  if (options.bookId) context.bookId = options.bookId;
  if (options.taskId) context.taskId = options.taskId;
  if (options.sessionId) context.sessionId = options.sessionId;
  if (options.aiModelId) context.aiModelId = options.aiModelId;
  if (options.onAction) context.onAction = options.onAction;
  if (options.onToast) context.onToast = options.onToast;
  if (chunkBoundaries) context.chunkBoundaries = chunkBoundaries;
  if (options.aiProcessingStore) context.aiProcessingStore = options.aiProcessingStore;
  if (options.chunkIndex !== undefined) context.chunkIndex = options.chunkIndex;
  if (options.submittedParagraphIds) context.submittedParagraphIds = options.submittedParagraphIds;
  if (options.accumulatedParagraphs) context.accumulatedParagraphs = options.accumulatedParagraphs;
  if (options.enableOriginalTextValidation !== undefined) {
    context.enableOriginalTextValidation = options.enableOriginalTextValidation;
  }

  return context;
}

/**
 * 构造"未知工具"错误结果。
 */
export function buildUnknownToolResult(toolCall: AIToolCall): AIToolCallResult {
  const functionName = toolCall.function.name;
  console.warn(`[ToolRegistry] ⚠️ 未知的工具: ${functionName}`);
  return {
    tool_call_id: toolCall.id,
    role: 'tool',
    name: functionName,
    content: JSON.stringify({ success: false, error: `未知的工具: ${functionName}` }),
  };
}

/**
 * 构造"调用失败"错误结果。
 */
export function buildErrorToolResult(
  toolCall: AIToolCall,
  error: unknown,
): AIToolCallResult {
  const functionName = toolCall.function.name;
  const errorMsg = error instanceof Error ? error.message : '未知错误';
  console.error(`[ToolRegistry] ❌ 工具调用失败 [${functionName}]:`, errorMsg);
  return {
    tool_call_id: toolCall.id,
    role: 'tool',
    name: functionName,
    content: JSON.stringify({ success: false, error: errorMsg }),
  };
}

/**
 * 调用单个 tool definition 并包装结果；出错时抛出，由外层统一捕获。
 */
export async function invokeToolHandler(
  tool: ToolDefinition,
  toolCall: AIToolCall,
  options: HandleToolCallOptions,
): Promise<AIToolCallResult> {
  const functionName = toolCall.function.name;
  const args = parseToolCallArguments(toolCall.function.arguments, functionName);

  console.log(
    `[ToolRegistry] 🔧 AI 调用工具: ${functionName}${options.bookId ? ` (bookId: ${options.bookId})` : ''}`,
    previewForLog(args),
  );

  const context = buildToolHandlerContext(options);
  const result = await tool.handler(args, context);

  console.log(`[ToolRegistry] ✅ 工具调用成功 [${functionName}]:`, previewForLog(result));

  return {
    tool_call_id: toolCall.id,
    role: 'tool',
    name: functionName,
    content: result,
  };
}
