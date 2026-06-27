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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 从 JSON 解析出的对象推断 tone；命中返回对应 tone，否则返回 null（回退到关键词判断）。
 */
function toneFromParsedObject(parsed: Record<string, unknown>): ToolResultTone | null {
  if (parsed.success === false) return 'error';
  if (isNonEmptyString(parsed.error)) return 'error';
  if (isNonEmptyString(parsed.warning)) return 'warning';
  if (Array.isArray(parsed.warnings) && parsed.warnings.length > 0) return 'warning';
  if (parsed.success === true) return 'success';
  return null;
}

interface BracketMarkerMatch {
  index: number;
  fullText: string;
  content: string;
}

interface ScanStringState {
  inString: boolean;
  quoteChar: string;
}

/**
 * 根据当前字符推进字符串状态机：进入/退出引号字符串。
 * 在字符串内部时该字符不参与括号匹配。
 */
function advanceStringState(state: ScanStringState, char: string | undefined): void {
  if (state.inString) {
    if (char === state.quoteChar) {
      state.inString = false;
      state.quoteChar = '';
    }
    return;
  }
  if (char === '"' || char === "'") {
    state.inString = true;
    state.quoteChar = char;
  }
}

function findMatchingCloseBracket(message: string, from: number): number {
  const state: ScanStringState = { inString: false, quoteChar: '' };
  let escaped = false;
  let bracketDepth = 0;

  for (let i = from; i < message.length; i++) {
    const char = message[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    const wasInString = state.inString;
    advanceStringState(state, char);
    // 该字符处于字符串上下文（进入、内部或闭合），跳过括号匹配
    if (wasInString || state.inString) continue;

    if (char === '[') {
      bracketDepth++;
      continue;
    }
    if (char === ']') {
      if (bracketDepth === 0) return i;
      bracketDepth--;
    }
  }

  return -1;
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
    const closeIndex = findMatchingCloseBracket(message, contentStart);
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
      const tone = toneFromParsedObject(parsed);
      if (tone) return tone;
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
  const allMatches = collectThinkingMarkerMatches(message);
  const pendingToolCallPartIndexes: number[] = [];
  let currentIndex = 0;

  for (const { index, type, match: m } of allMatches) {
    if (index > currentIndex) {
      const text = message.slice(currentIndex, index).trim();
      if (text) parts.push({ type: 'content', text });
    }
    applyThinkingMatchToParts(type, m, parts, pendingToolCallPartIndexes);
    currentIndex = index + m[0].length;
  }

  if (currentIndex < message.length) {
    const text = message.slice(currentIndex).trim();
    if (text) parts.push({ type: 'content', text });
  }

  if (parts.length === 0 && message.trim()) {
    parts.push({ type: 'content', text: message });
  }

  applyFallbackToneToPendingToolCalls(parts, pendingToolCallPartIndexes, taskStatus);
  return parts;
}

type ThinkingMatchType =
  | 'chunk-separator'
  | 'state-transition'
  | 'tool-call'
  | 'tool-call-args'
  | 'tool-result';

interface ThinkingMatch {
  index: number;
  type: ThinkingMatchType;
  match: RegExpMatchArray;
}

/** 将 regex 全局扫描的结果按出现位置收集到数组（对正则 lastIndex 做幂等重置） */
function collectGlobalRegexMatches(
  message: string,
  pattern: RegExp,
  type: ThinkingMatchType,
  out: ThinkingMatch[],
): void {
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    out.push({ index: match.index, type, match });
  }
  pattern.lastIndex = 0;
}

/** 汇总所有 thinking marker 的匹配并按 index 升序排序 */
function collectThinkingMarkerMatches(message: string): ThinkingMatch[] {
  const allMatches: ThinkingMatch[] = [];
  collectGlobalRegexMatches(message, CHUNK_SEPARATOR_PATTERN, 'chunk-separator', allMatches);
  collectGlobalRegexMatches(message, STATE_TRANSITION_PATTERN, 'state-transition', allMatches);
  collectGlobalRegexMatches(message, TOOL_CALL_PATTERN, 'tool-call', allMatches);

  for (const m of extractBracketBalancedMarkerMatches(message, TOOL_CALL_ARGS_PREFIX)) {
    const syntheticMatch = [m.fullText, m.content] as unknown as RegExpMatchArray;
    allMatches.push({ index: m.index, type: 'tool-call-args', match: syntheticMatch });
  }
  for (const m of extractBracketBalancedMarkerMatches(message, '[工具结果: ')) {
    const syntheticMatch = [m.fullText, m.content] as unknown as RegExpMatchArray;
    allMatches.push({ index: m.index, type: 'tool-result', match: syntheticMatch });
  }

  allMatches.sort((a, b) => a.index - b.index);
  return allMatches;
}

/** 将单个 match 应用到 parts（根据 type 分派到对应 part 构造 / 关联逻辑） */
function applyThinkingMatchToParts(
  type: ThinkingMatchType,
  m: RegExpMatchArray,
  parts: FormattedMessagePart[],
  pendingToolCallPartIndexes: number[],
): void {
  switch (type) {
    case 'chunk-separator':
      applyChunkSeparatorMatch(m, parts);
      return;
    case 'state-transition':
      applyStateTransitionMatch(m, parts);
      return;
    case 'tool-call':
      applyToolCallMatch(m, parts, pendingToolCallPartIndexes);
      return;
    case 'tool-call-args':
      applyToolCallArgsMatch(m, parts, pendingToolCallPartIndexes);
      return;
    case 'tool-result':
      applyToolResultMatch(m, parts, pendingToolCallPartIndexes);
      return;
  }
}

function applyChunkSeparatorMatch(m: RegExpMatchArray, parts: FormattedMessagePart[]): void {
  parts.push({ type: 'chunk-separator', text: m[0], chunkInfo: `${m[1]}块 ${m[2]}` });
}

function applyStateTransitionMatch(m: RegExpMatchArray, parts: FormattedMessagePart[]): void {
  if (m[1] && m[2]) {
    parts.push({ type: 'state-transition', text: m[0], fromStatus: m[1], toStatus: m[2] });
  }
}

function applyToolCallMatch(
  m: RegExpMatchArray,
  parts: FormattedMessagePart[],
  pendingToolCallPartIndexes: number[],
): void {
  if (!m[1]) return;
  parts.push({ type: 'tool-call', text: m[0], toolName: m[1], toolCallTone: 'running' });
  pendingToolCallPartIndexes.push(parts.length - 1);
}

function applyToolCallArgsMatch(
  m: RegExpMatchArray,
  parts: FormattedMessagePart[],
  pendingToolCallPartIndexes: number[],
): void {
  if (m[1] === undefined) return;
  const lastIdx = pendingToolCallPartIndexes[pendingToolCallPartIndexes.length - 1];
  if (lastIdx === undefined) return;
  const toolCallPart = parts[lastIdx];
  if (toolCallPart?.type === 'tool-call') {
    toolCallPart.toolCallArgs = formatToolResultTooltip(m[1]);
  }
}

function applyToolResultMatch(
  m: RegExpMatchArray,
  parts: FormattedMessagePart[],
  pendingToolCallPartIndexes: number[],
): void {
  if (!m[1]) return;
  const tone = detectToolResultTone(m[1]);
  const toolCallTone = mapToolResultToneToToolCallTone(tone);
  const matchedIdx = pendingToolCallPartIndexes.shift();
  if (matchedIdx !== undefined) {
    const matchedPart = parts[matchedIdx];
    if (matchedPart?.type === 'tool-call') matchedPart.toolCallTone = toolCallTone;
  }
  parts.push({
    type: 'tool-result',
    text: m[0],
    toolName: formatToolResultPreview(m[1]),
    toolResult: formatToolResultTooltip(m[1]),
    toolResultTone: tone,
  });
}

/** 根据 taskStatus 选择回退 tone */
function pickFallbackTone(taskStatus: AIProcessingTask['status'] | undefined): ToolCallTone {
  if (taskStatus === 'cancelled') return 'cancelled';
  if (taskStatus === 'error') return 'error';
  if (taskStatus === 'end') return 'success';
  return 'running';
}

/** 消息解析结束后，给未闭合的 tool-call 套上 fallback tone */
function applyFallbackToneToPendingToolCalls(
  parts: FormattedMessagePart[],
  pendingToolCallPartIndexes: number[],
  taskStatus: AIProcessingTask['status'] | undefined,
): void {
  if (pendingToolCallPartIndexes.length === 0) return;
  const fallbackTone = pickFallbackTone(taskStatus);
  for (const idx of pendingToolCallPartIndexes) {
    const p = parts[idx];
    if (p?.type === 'tool-call') p.toolCallTone = fallbackTone;
  }
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

  // 清理已从 tasks 中移除的任务：删除缓存、解析长度与节流器
  const cleanupRemovedTaskCaches = (currentIds: Set<string>): void => {
    for (const taskId of Object.keys(cache.value)) {
      if (currentIds.has(taskId)) continue;
      delete cache.value[taskId];
      parsedLengths.delete(taskId);
      const t = throttles.get(taskId);
      if (t) {
        t.cleanup();
        throttles.delete(taskId);
      }
    }
  };

  // 处理单个任务的 watch 变更：状态切换或消息缩短 → 完整重解析；增长 → 节流增量
  const processWatchedTask = (
    task: { id: string; thinkLen: number; status: string },
    oldMap: Map<string, { id: string; thinkLen: number; status: string }>,
  ): void => {
    const old = oldMap.get(task.id);
    const oldThinkLen = old?.thinkLen ?? 0;
    const statusChanged = !!old && old.status !== task.status;

    // 状态切换或消息缩短 → 立即完整重解析（状态影响 tool-call 的 tone 回填）
    if (statusChanged || task.thinkLen < oldThinkLen) {
      const fullTask = tasks.value.find((t) => t.id === task.id);
      fullReparse(task.id, fullTask);
      return;
    }
    // 消息增长 → 节流路径（优先尝试增量快速路径）
    if (task.thinkLen > oldThinkLen) {
      scheduleUpdate(task.id);
    }
  };

  // 监听思考消息长度与任务状态变化
  watch(
    () =>
      tasks.value.map((t) => ({
        id: t.id,
        thinkLen: t.thinkingMessage?.length || 0,
        status: t.status,
      })),
    (newTasks, oldTasks) => {
      const oldMap = new Map((oldTasks || []).map((t) => [t.id, t]));
      const currentIds = new Set(newTasks.map((t) => t.id));

      cleanupRemovedTaskCaches(currentIds);

      for (const task of newTasks) {
        processWatchedTask(task, oldMap);
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
