import { ref, watch, onUnmounted, type Ref } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { throttle } from 'src/utils/throttle';

// 常量
const FORMAT_CACHE_THROTTLE_MS = 200;

// ─── 类型定义 ───

export type ToolResultTone = 'success' | 'warning' | 'error';
export type ToolCallTone = 'running' | 'success' | 'warning' | 'error' | 'cancelled';

export interface FormattedMessagePart {
  type: 'chunk-separator' | 'state-transition' | 'tool-call' | 'tool-result' | 'content';
  text: string;
  toolName?: string;
  toolResult?: string;
  toolResultTone?: ToolResultTone;
  toolCallTone?: ToolCallTone;
  toolCallArgs?: string;
  chunkInfo?: string;
  fromStatus?: string;
  toStatus?: string;
}

// ─── 正则与检测工具 ───

/**
 * 状态切换标记：由 task-runner 在思考流中注入，UI 解析后渲染为特殊分隔条
 * 格式与 {@link buildStateTransitionMarker} 一一对应，修改时必须同步调整
 */
const STATE_TRANSITION_PATTERN = /\[状态切换: (\w+) → (\w+)\]/g;

/**
 * 构造状态切换标记。使用此函数而非手写字符串以避免与解析正则漂移
 */
export function buildStateTransitionMarker(fromStatus: string, toStatus: string): string {
  return `\n\n[状态切换: ${fromStatus} → ${toStatus}]\n\n`;
}

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

function detectToolResultTone(toolResult: string): ToolResultTone {
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

function formatToolResultPreview(toolResult: string): string {
  const compact = toolResult.replace(/\s+/g, ' ').trim();
  if (compact.length <= 100) return compact;
  return `${compact.slice(0, 100)}...`;
}

function formatToolResultTooltip(toolResult: string): string {
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
    type: 'chunk-separator' | 'state-transition' | 'tool-call' | 'tool-call-args' | 'tool-result';
    match: RegExpMatchArray;
  }> = [];

  let match;
  while ((match = CHUNK_SEPARATOR_PATTERN.exec(message)) !== null) {
    allMatches.push({ index: match.index, type: 'chunk-separator', match });
  }
  CHUNK_SEPARATOR_PATTERN.lastIndex = 0;

  while ((match = STATE_TRANSITION_PATTERN.exec(message)) !== null) {
    allMatches.push({ index: match.index, type: 'state-transition', match });
  }
  STATE_TRANSITION_PATTERN.lastIndex = 0;

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
    } else if (type === 'state-transition') {
      if (m[1] && m[2]) {
        parts.push({
          type: 'state-transition',
          text: m[0],
          fromStatus: m[1],
          toStatus: m[2],
        });
      }
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

// ─── 增量解析快速路径（纯函数，可独立测试）───

/**
 * 尝试对追加式更新应用增量解析，避免重新扫描整条消息。
 *
 * 命中条件（全部满足时才能走快速路径）：
 *  1. `newMessage` 长度不短于 `prevLen`（即不是清空/重置）
 *  2. 新追加的尾部不包含 `[`（不会引入新标记）
 *  3. 旧消息末尾不存在未闭合的 `[`（即使尾部没有 `[`，老消息的半成品标记也可能被新尾部补完）
 *
 * 命中时返回新的 parts 数组（结构与 `formatThinkingMessage` 相同）；未命中返回 `null`，调用方回退到完整解析。
 * 空尾部会直接返回原始 `prevParts`（引用相等，便于上层跳过重新渲染）。
 */
export function tryIncrementalFormat(
  prevParts: FormattedMessagePart[],
  prevLen: number,
  newMessage: string,
): FormattedMessagePart[] | null {
  if (newMessage.length < prevLen) return null;

  const tail = newMessage.slice(prevLen);
  if (!tail) return prevParts;
  if (tail.includes('[')) return null;

  const oldMsg = newMessage.slice(0, prevLen);
  const lastOpen = oldMsg.lastIndexOf('[');
  const lastClose = oldMsg.lastIndexOf(']');
  if (lastOpen > lastClose) return null;

  const lastPart = prevParts[prevParts.length - 1];
  const newParts = prevParts.slice();
  if (lastPart?.type === 'content') {
    newParts[newParts.length - 1] = { ...lastPart, text: lastPart.text + tail };
  } else {
    newParts.push({ type: 'content', text: tail });
  }
  return newParts;
}

// ─── Composable: 带缓存、节流与增量更新的格式化 ───

export function useThinkingFormatter(
  tasks: Ref<AIProcessingTask[]>,
) {
  const cache = ref<Record<string, FormattedMessagePart[]>>({});
  // 记录每个任务已解析到的消息长度，用于判断是否可以走增量快速路径
  const parsedLengths = new Map<string, number>();
  const throttles = new Map<string, { fn: (id: string) => void; cleanup: () => void }>();

  const buildParts = (task: AIProcessingTask): FormattedMessagePart[] => {
    const msg = task.thinkingMessage ?? '';
    return msg ? formatThinkingMessage(msg, task.status) : [];
  };

  /**
   * 完整重新解析：O(消息长度) 的慢路径。
   * 仅在消息缩短、状态切换或尾部检测到新标记时执行。
   */
  const fullReparse = (taskId: string, task: AIProcessingTask | undefined) => {
    if (!task) {
      delete cache.value[taskId];
      parsedLengths.delete(taskId);
      return;
    }
    cache.value[taskId] = buildParts(task);
    parsedLengths.set(taskId, (task.thinkingMessage ?? '').length);
  };

  /**
   * 应用增量更新结果到缓存；命中返回 true，未命中返回 false（由调用方回退到 fullReparse）。
   */
  const tryIncrementalUpdate = (taskId: string, task: AIProcessingTask): boolean => {
    const prevParts = cache.value[taskId];
    const prevLen = parsedLengths.get(taskId);
    if (!prevParts || prevLen === undefined) return false;

    const msg = task.thinkingMessage ?? '';
    const result = tryIncrementalFormat(prevParts, prevLen, msg);
    if (result === null) return false;

    cache.value[taskId] = result;
    parsedLengths.set(taskId, msg.length);
    return true;
  };

  const scheduleUpdate = (taskId: string) => {
    let entry = throttles.get(taskId);
    if (!entry) {
      entry = throttle((id: string) => {
        const task = tasks.value.find((t) => t.id === id);
        if (!task) {
          delete cache.value[id];
          parsedLengths.delete(id);
          return;
        }
        if (tryIncrementalUpdate(id, task)) return;
        fullReparse(id, task);
      }, FORMAT_CACHE_THROTTLE_MS);
      throttles.set(taskId, entry);
    }
    entry.fn(taskId);
  };

  const getFormatted = (taskId: string): FormattedMessagePart[] => {
    return cache.value[taskId] || [];
  };

  // 监听思考消息长度与任务状态变化
  watch(
    () => tasks.value.map((t) => ({
      id: t.id,
      thinkLen: t.thinkingMessage?.length || 0,
      status: t.status,
    })),
    (newTasks, oldTasks) => {
      const oldMap = new Map((oldTasks || []).map((t) => [t.id, t]));
      const currentIds = new Set(newTasks.map((t) => t.id));

      // 清理已移除任务
      for (const taskId of Object.keys(cache.value)) {
        if (!currentIds.has(taskId)) {
          delete cache.value[taskId];
          parsedLengths.delete(taskId);
          const t = throttles.get(taskId);
          if (t) { t.cleanup(); throttles.delete(taskId); }
        }
      }

      for (const task of newTasks) {
        const old = oldMap.get(task.id);
        const oldThinkLen = old?.thinkLen ?? 0;
        const statusChanged = !!old && old.status !== task.status;

        // 状态切换或消息缩短 → 立即完整重解析（状态影响 tool-call 的 tone 回填）
        if (statusChanged || task.thinkLen < oldThinkLen) {
          const fullTask = tasks.value.find((t) => t.id === task.id);
          fullReparse(task.id, fullTask);
          continue;
        }
        // 消息增长 → 节流路径（优先尝试增量快速路径）
        if (task.thinkLen > oldThinkLen) {
          scheduleUpdate(task.id);
        }
      }
    },
    { flush: 'post' },
  );

  onUnmounted(() => {
    throttles.forEach((t) => t.cleanup());
    throttles.clear();
    parsedLengths.clear();
  });

  return { getFormatted, cache };
}
