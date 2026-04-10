import { ref, watch, onUnmounted, type Ref } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { throttle } from 'src/utils/throttle';

// 常量
const FORMAT_CACHE_THROTTLE_MS = 200;

// ─── 类型定义 ───

export type ToolResultTone = 'success' | 'warning' | 'error';
export type ToolCallTone = 'running' | 'success' | 'warning' | 'error' | 'cancelled';

export interface FormattedMessagePart {
  type: 'chunk-separator' | 'tool-call' | 'tool-result' | 'content';
  text: string;
  toolName?: string;
  toolResult?: string;
  toolResultTone?: ToolResultTone;
  toolCallTone?: ToolCallTone;
  toolCallArgs?: string;
  chunkInfo?: string;
}

// ─── 正则与检测工具 ───

const CHUNK_SEPARATOR_PATTERN = /\[=== (翻译|润色|校对)块 (\d+\/\d+) ===\]/g;
const TOOL_CALL_PATTERN = /\[调用工具: ([^\]]+)\]/g;
const TOOL_CALL_ARGS_PREFIX = '[调用参数: ';
const TOOL_RESULT_ERROR_PATTERN =
  /error|failed?|exception|forbidden|denied|invalid|timeout|not found|失败|错误|异常|拒绝|超时|无效|未找到/i;
const TOOL_RESULT_WARNING_PATTERN = /warning|warn|警告|注意|deprecated|fallback|重试/i;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface BracketMarkerMatch {
  index: number;
  fullText: string;
  content: string;
}

function extractBracketBalancedMarkerMatches(
  message: string,
  prefix: string,
): BracketMarkerMatch[] {
  const matches: BracketMarkerMatch[] = [];
  let searchStart = 0;

  while (searchStart < message.length) {
    const startIndex = message.indexOf(prefix, searchStart);
    if (startIndex === -1) break;

    const contentStart = startIndex + prefix.length;
    let i = contentStart;
    let inString = false;
    let quoteChar = '';
    let escaped = false;
    let bracketDepth = 0;
    let closeIndex = -1;

    for (; i < message.length; i++) {
      const char = message[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (inString) {
        if (char === quoteChar) { inString = false; quoteChar = ''; }
        continue;
      }
      if (char === '"' || char === "'") { inString = true; quoteChar = char; continue; }
      if (char === '[') { bracketDepth++; continue; }
      if (char === ']') {
        if (bracketDepth === 0) { closeIndex = i; break; }
        bracketDepth--;
      }
    }

    if (closeIndex === -1) break;
    matches.push({
      index: startIndex,
      fullText: message.slice(startIndex, closeIndex + 1),
      content: message.slice(contentStart, closeIndex),
    });
    searchStart = closeIndex + 1;
  }

  return matches;
}

// ─── 公共工具函数 ───

export function detectToolResultTone(toolResult: string): ToolResultTone {
  const trimmed = toolResult.trim();
  if (!trimmed) return 'warning';

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isObjectRecord(parsed)) {
      if (parsed.success === false) return 'error';
      if (typeof parsed.error === 'string' && parsed.error.trim()) return 'error';
      if (typeof parsed.warning === 'string' && parsed.warning.trim()) return 'warning';
      if (Array.isArray(parsed.warnings) && parsed.warnings.length > 0) return 'warning';
      if (parsed.success === true) return 'success';
    }
  } catch {
    // 非 JSON 回退到关键词判断
  }

  if (TOOL_RESULT_ERROR_PATTERN.test(trimmed)) return 'error';
  if (TOOL_RESULT_WARNING_PATTERN.test(trimmed)) return 'warning';
  return 'success';
}

export function formatToolResultPreview(toolResult: string): string {
  const compact = toolResult.replace(/\s+/g, ' ').trim();
  if (compact.length <= 100) return compact;
  return `${compact.slice(0, 100)}...`;
}

export function formatToolResultTooltip(toolResult: string): string {
  const trimmed = toolResult.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return toolResult;
  }
}

function mapToolResultToneToToolCallTone(tone: ToolResultTone): ToolCallTone {
  if (tone === 'error') return 'error';
  if (tone === 'warning') return 'warning';
  return 'success';
}

export function getToolCallTone(task: AIProcessingTask, part: FormattedMessagePart): ToolCallTone {
  if (part.toolCallTone) return part.toolCallTone;
  if (task.status === 'cancelled') return 'cancelled';
  if (task.status === 'error') return 'error';
  if (task.status === 'end') return 'success';
  return 'running';
}

// ─── 核心格式化函数 ───

export function formatThinkingMessage(
  message: string,
  taskStatus?: AIProcessingTask['status'],
): FormattedMessagePart[] {
  if (!message) return [];

  const parts: FormattedMessagePart[] = [];
  let currentIndex = 0;

  const allMatches: Array<{
    index: number;
    type: 'chunk-separator' | 'tool-call' | 'tool-call-args' | 'tool-result';
    match: RegExpMatchArray;
  }> = [];

  let match;
  while ((match = CHUNK_SEPARATOR_PATTERN.exec(message)) !== null) {
    allMatches.push({ index: match.index, type: 'chunk-separator', match });
  }
  CHUNK_SEPARATOR_PATTERN.lastIndex = 0;

  while ((match = TOOL_CALL_PATTERN.exec(message)) !== null) {
    allMatches.push({ index: match.index, type: 'tool-call', match });
  }
  TOOL_CALL_PATTERN.lastIndex = 0;

  for (const m of extractBracketBalancedMarkerMatches(message, TOOL_CALL_ARGS_PREFIX)) {
    const syntheticMatch = [m.fullText, m.content] as unknown as RegExpMatchArray;
    allMatches.push({ index: m.index, type: 'tool-call-args', match: syntheticMatch });
  }

  for (const m of extractBracketBalancedMarkerMatches(message, '[工具结果: ')) {
    const syntheticMatch = [m.fullText, m.content] as unknown as RegExpMatchArray;
    allMatches.push({ index: m.index, type: 'tool-result', match: syntheticMatch });
  }

  allMatches.sort((a, b) => a.index - b.index);

  const pendingToolCallPartIndexes: number[] = [];

  for (const { index, type, match: m } of allMatches) {
    if (index > currentIndex) {
      const text = message.slice(currentIndex, index).trim();
      if (text) parts.push({ type: 'content', text });
    }

    if (type === 'chunk-separator') {
      parts.push({
        type: 'chunk-separator',
        text: m[0],
        chunkInfo: `${m[1]}块 ${m[2]}`,
      });
    } else if (type === 'tool-call') {
      if (m[1]) {
        parts.push({ type: 'tool-call', text: m[0], toolName: m[1], toolCallTone: 'running' });
        pendingToolCallPartIndexes.push(parts.length - 1);
      }
    } else if (type === 'tool-call-args') {
      if (m[1] !== undefined) {
        const lastIdx = pendingToolCallPartIndexes[pendingToolCallPartIndexes.length - 1];
        if (lastIdx !== undefined) {
          const toolCallPart = parts[lastIdx];
          if (toolCallPart?.type === 'tool-call') {
            toolCallPart.toolCallArgs = formatToolResultTooltip(m[1]);
          }
        }
      }
    } else if (type === 'tool-result') {
      if (m[1]) {
        const tone = detectToolResultTone(m[1]);
        const toolCallTone = mapToolResultToneToToolCallTone(tone);
        const matchedIdx = pendingToolCallPartIndexes.shift();
        if (matchedIdx !== undefined) {
          const matchedPart = parts[matchedIdx];
          if (matchedPart?.type === 'tool-call') {
            matchedPart.toolCallTone = toolCallTone;
          }
        }
        parts.push({
          type: 'tool-result',
          text: m[0],
          toolName: formatToolResultPreview(m[1]),
          toolResult: formatToolResultTooltip(m[1]),
          toolResultTone: tone,
        });
      }
    }

    currentIndex = index + m[0].length;
  }

  if (currentIndex < message.length) {
    const text = message.slice(currentIndex).trim();
    if (text) parts.push({ type: 'content', text });
  }

  if (parts.length === 0 && message.trim()) {
    parts.push({ type: 'content', text: message });
  }

  if (pendingToolCallPartIndexes.length > 0) {
    const fallbackTone: ToolCallTone =
      taskStatus === 'cancelled' ? 'cancelled'
        : taskStatus === 'error' ? 'error'
          : taskStatus === 'end' ? 'success'
            : 'running';
    for (const idx of pendingToolCallPartIndexes) {
      const p = parts[idx];
      if (p?.type === 'tool-call') p.toolCallTone = fallbackTone;
    }
  }

  return parts;
}

// ─── Composable: 带缓存和节流的格式化 ───

export function useThinkingFormatter(
  tasks: Ref<AIProcessingTask[]>,
) {
  const cache = ref<Record<string, FormattedMessagePart[]>>({});
  const throttles = new Map<string, { fn: (id: string) => void; cleanup: () => void }>();

  const buildParts = (task: AIProcessingTask): FormattedMessagePart[] => {
    const msg = task.thinkingMessage ?? '';
    return msg ? formatThinkingMessage(msg, task.status) : [];
  };

  const getThrottle = (taskId: string) => {
    if (!throttles.has(taskId)) {
      const t = throttle((id: string) => {
        const task = tasks.value.find((t) => t.id === id);
        cache.value[id] = task ? buildParts(task) : [];
      }, FORMAT_CACHE_THROTTLE_MS);
      throttles.set(taskId, t);
    }
    return throttles.get(taskId)!;
  };

  const getFormatted = (taskId: string): FormattedMessagePart[] => {
    return cache.value[taskId] || [];
  };

  // 监听思考消息和输出内容长度变化，节流更新缓存
  watch(
    () => tasks.value.map((t) => ({
      id: t.id,
      thinkLen: t.thinkingMessage?.length || 0,
      outLen: t.outputContent?.length || 0,
    })),
    (newTasks, oldTasks) => {
      const oldMap = new Map((oldTasks || []).map((t) => [t.id, t]));
      const currentIds = new Set(newTasks.map((t) => t.id));

      // 清理已移除任务
      for (const taskId of Object.keys(cache.value)) {
        if (!currentIds.has(taskId)) {
          delete cache.value[taskId];
          const t = throttles.get(taskId);
          if (t) { t.cleanup(); throttles.delete(taskId); }
        }
      }

      for (const task of newTasks) {
        const old = oldMap.get(task.id);
        const oldThinkLen = old?.thinkLen || 0;
        const oldOutLen = old?.outLen || 0;
        if (task.thinkLen < oldThinkLen || task.outLen < oldOutLen) {
          const t = tasks.value.find((t) => t.id === task.id);
          cache.value[task.id] = t ? buildParts(t) : [];
        } else if (task.thinkLen > oldThinkLen || task.outLen > oldOutLen) {
          getThrottle(task.id).fn(task.id);
        }
      }
    },
    { flush: 'post' },
  );

  onUnmounted(() => {
    throttles.forEach((t) => t.cleanup());
    throttles.clear();
  });

  return { getFormatted, cache };
}
