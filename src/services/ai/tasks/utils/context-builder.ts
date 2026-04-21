import type {
  Paragraph,
  CharacterSetting,
  Terminology,
  ScoreBreakdown,
} from 'src/models/novel';
import { getSelectedTranslation } from 'src/utils/text-utils';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import type { Memory } from 'src/models/memory';
import {
  scoreMemoriesBatch,
  selectByBudget,
  DEFAULT_CHAR_BUDGET,
  HARD_ITEM_CAP,
  DEFAULT_MIN_SCORE,
  type ScoredMemory,
} from 'src/services/memory-scoring';
import { EmbeddingService, MODEL_VERSION } from 'src/services/embedding-service';
import { useSettingsStore } from 'src/stores/settings';
import { type TaskType, MAX_DESC_LEN } from './task-types';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { getPostToolCallReminder } from './todo-helper';
import { getCurrentStatusInfo } from '../prompts/common';
import { useBooksStore } from 'src/stores/books';
import { findUniqueTermsInText, findUniqueCharactersInText } from 'src/utils/text-matcher';

/**
 * 获取章节第一个“非空”段落的 ID（用于判断任务是否从章节中间开始）
 * - “非空”定义：text.trim().length > 0
 * - 若无法获取（无 chapterId / 加载失败 / 无非空段落）则返回 undefined
 */
export async function getChapterFirstNonEmptyParagraphId(
  chapterId?: string,
  logLabel = 'AITaskHelper',
): Promise<string | undefined> {
  if (!chapterId) return undefined;
  try {
    const chapterContent = await ChapterContentService.loadChapterContent(chapterId);
    return chapterContent?.find((p) => !!p?.text?.trim())?.id;
  } catch (e) {
    console.warn(
      `[${logLabel}] ⚠️ 无法获取章节首段信息（chapterId: ${chapterId}）`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/**
 * 判断当前 chunk 是否存在“前文段落”（即起始段落不是章节第一个非空段落）
 */
export function getHasPreviousParagraphs(
  chapterFirstNonEmptyParagraphId?: string,
  firstParagraphId?: string,
): boolean {
  return (
    !!chapterFirstNonEmptyParagraphId &&
    !!firstParagraphId &&
    firstParagraphId !== chapterFirstNonEmptyParagraphId
  );
}

/**
 * 构建维护提醒（用于每个文本块）- 精简版
 */
export function buildMaintenanceReminder(taskType: TaskType): string {
  const reminders = {
    translation: `\n[提示] 空段落已过滤（无需输出/无需补回）。`,
    proofreading: `\n[提示] 空段落已过滤；只需返回有变化的段落（无变化可直接结束）。`,
    polish: `\n[提示] 空段落已过滤；只需返回有变化的段落（无变化可直接结束）。`,
  };
  return reminders[taskType];
}

/**
 * 构建章节上下文信息（用于系统提示词）
 * @param chapterId 章节 ID（可选）
 * @param chapterTitle 章节标题（可选）
 * @returns 格式化的章节上下文字符串，如果都没有则返回空字符串
 */
export function buildChapterContextSection(chapterId?: string, chapterTitle?: string): string {
  const parts: string[] = [];
  if (chapterId) {
    parts.push(`**当前章节 ID**: \`${chapterId}\``);
  }
  if (chapterTitle) {
    parts.push(`**当前章节标题**: ${chapterTitle}`);
  }
  return parts.length > 0 ? `\n\n【当前章节信息】\n${parts.join('\n')}\n` : '';
}

/**
 * 构建前一个章节的上下文信息(仅标题,保持时序感知)。
 * 章节摘要字段已移除,AI 如需前一章具体内容可调用 `query_chapter` / `get_chapter_info`。
 * @param title 前一章节标题
 * @returns 格式化的前文信息,无 title 时返回空字符串
 */
export function buildPreviousChapterSection(title?: string): string {
  if (!title) return '';
  return `\n\n【前文信息】\n**前一章节标题**: ${title}\n`;
}

/**
 * 构建书籍上下文信息（用于系统提示词）
 * - 翻译相关任务：提供书名、简介、标签，帮助模型统一风格与用词
 */
export function buildBookContextSectionFromBook(book: {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  skipAskUser?: boolean | undefined;
}): string {
  const title = typeof book.title === 'string' ? book.title.trim() : '';
  const description = typeof book.description === 'string' ? book.description.trim() : '';
  const tags = Array.isArray(book.tags)
    ? book.tags.filter((t) => typeof t === 'string' && t.trim())
    : [];
  const skipAskUser = !!book.skipAskUser;

  // 如果都没有，返回空字符串
  if (!title && !description && tags.length === 0 && !skipAskUser) {
    return '';
  }

  // 简介可能很长，做一个保守截断（避免提示词过长）
  const normalizedDesc =
    description.length > MAX_DESC_LEN
      ? `${description.slice(0, MAX_DESC_LEN)}...(已截断)`
      : description;

  const parts: string[] = [];
  if (title) {
    parts.push(`**书名**: ${title}`);
  }
  if (normalizedDesc) {
    parts.push(`**简介**: ${normalizedDesc}`);
  }
  if (tags.length > 0) {
    parts.push(`**标签**: ${tags.join('、')}`);
  }
  if (skipAskUser) {
    parts.push('**已开启跳过 AI 追问**: 是（禁止调用 `ask_user`）');
  }

  return `\n\n【书籍信息】\n${parts.join('\n')}\n`;
}

/**
 * 获取书籍上下文信息（从 store 获取；必要时回退到 BookService）
 * @param bookId 书籍 ID
 */
export async function buildBookContextSection(bookId?: string): Promise<string> {
  if (!bookId) return '';

  try {
    const { GlobalConfig } = await import('src/services/global-config-cache');
    const source = await GlobalConfig.getBookContextSource(bookId);
    if (source) {
      return buildBookContextSectionFromBook(source);
    }
  } catch (e) {
    console.warn(
      `[buildBookContextSection] ⚠️ 获取书籍上下文失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
  }

  return '';
}

/**
 * 获取书籍级配置：是否跳过 ask_user（优先 store，必要时回退 BookService）
 */
export async function isSkipAskUserEnabled(bookId?: string): Promise<boolean> {
  if (!bookId) return false;

  try {
    const { GlobalConfig } = await import('src/services/global-config-cache');
    return await GlobalConfig.isSkipAskUserEnabledForBook(bookId);
  } catch (e) {
    console.warn(
      `[isSkipAskUserEnabled] ⚠️ 获取书籍设置失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

/**
 * 获取书籍级配置：是否启用原文校验（original_text_prefix 校验）
 * - true: 启用校验
 * - false/undefined: 禁用校验（默认）
 */
export function isOriginalTextValidationEnabled(bookId?: string): boolean {
  if (!bookId) return false;

  try {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    return book?.enableOriginalTextValidation === true;
  } catch (e) {
    console.warn(
      `[isOriginalTextValidationEnabled] ⚠️ 获取书籍设置失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

/**
 * 构建输出内容后的后续操作提示 - 精简版
 */
export function buildPostOutputPrompt(taskType: TaskType, taskId?: string): string {
  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  // 翻译相关任务：在 review 阶段额外提醒可回到 working 更新既有译文
  const canGoBackToWorkingReminder =
    taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading'
      ? '如果你想更新任何已输出的译文/润色/校对结果，请用 `update_task_status({"status":"working"})` 切回 working，并只提交需要更新的段落；'
      : '';

  return `完成。${todosReminder}${canGoBackToWorkingReminder}如需后续操作请调用工具，否则使用 \`update_task_status({"status":"end"})\` 结束。`;
}

/**
 * 遗留 LRU 实现:纯粹的"最近访问时间"兜底。
 * 保留作为新打分路径出错或无可用数据时的 fallback。
 */
export async function getRelatedMemoriesForChunkLegacy(
  bookId: string,
  chunkText: string,
  maxMemories: number = 15,
): Promise<string> {
  if (!bookId || !chunkText) return '';
  try {
    const recentMemories = await MemoryService.getRecentMemories(
      bookId,
      maxMemories,
      'lastAccessedAt',
      false,
    );
    if (recentMemories.length === 0) return '';
    const lines = recentMemories.map((m: Memory) => `  - [${m.id}] ${m.summary}`);
    return `\n\n【相关记忆】\n${lines.join('\n')}`;
  } catch (error) {
    console.warn('Failed to get related memories (legacy fallback):', error);
    return '';
  }
}

// ============================================================================
// 三信号打分路径 — 任务级 chunk embedding 缓存 + 选中记忆的 breakdown 旁路
// ============================================================================

/**
 * 任务级 chunk embedding 缓存:同一任务中不同分块会重复读取同一 chunkText,
 * 避免反复调用 transformers.js。键 = 原始文本,值 = 归一化后的向量或 null。
 *
 * 调用方应在任务结束时调用 `clearChunkEmbeddingCache()`。
 */
const CHUNK_CACHE_MAX_SIZE = 50;
const chunkEmbeddingCache = new Map<string, Float32Array | null>();

export function clearChunkEmbeddingCache(): void {
  chunkEmbeddingCache.clear();
  lastScoreBreakdownsByBook.clear();
}

/**
 * 最近一次打分得到的 breakdown 列表(按 bookId 索引)。
 * translation-service 在分块构造 Translation 时可从此读取,不影响其他调用方。
 * 采用"最后写入覆盖"语义,因为同一时刻一个 bookId 只有一个任务在跑。
 */
const lastScoreBreakdownsByBook = new Map<string, Record<string, ScoreBreakdown>>();

export function getLastScoreBreakdowns(bookId: string): Record<string, ScoreBreakdown> | undefined {
  return lastScoreBreakdownsByBook.get(bookId);
}

export function clearLastScoreBreakdowns(bookId?: string): void {
  if (bookId) {
    lastScoreBreakdownsByBook.delete(bookId);
  } else {
    lastScoreBreakdownsByBook.clear();
  }
}

/**
 * 尝试计算 chunk 的语义向量。
 * - 语义检索未启用 / service 未就绪 → 返回 null(调用方走纯关键词+时间衰减降级)
 * - 命中缓存直接返回
 */
async function computeChunkEmbedding(chunkText: string): Promise<Float32Array | null> {
  // 读取用户设置
  let enableSemantic = true;
  try {
    const settings = useSettingsStore();
    enableSemantic = settings.settings?.memoryInjection?.enableSemantic !== false;
  } catch {
    // store 初始化失败时保持默认启用
  }
  if (!enableSemantic) return null;
  if (!EmbeddingService.isReady()) return null;

  const cached = chunkEmbeddingCache.get(chunkText);
  if (cached !== undefined) return cached;

  try {
    const vec = await EmbeddingService.embed(chunkText, 'query');
    if (chunkEmbeddingCache.size >= CHUNK_CACHE_MAX_SIZE) {
      const oldest = chunkEmbeddingCache.keys().next().value;
      if (oldest !== undefined) chunkEmbeddingCache.delete(oldest);
    }
    chunkEmbeddingCache.set(chunkText, vec);
    return vec;
  } catch (error) {
    console.warn('[context-builder] 计算 chunk embedding 失败:', error);
    chunkEmbeddingCache.set(chunkText, null);
    return null;
  }
}

/**
 * 选择结果:UI 预览(`refreshReferencedMemories`)和翻译注入(`getRelatedMemoriesForChunk`)
 * 共享此结构,保证两边显示/注入的记忆集合严格一致。
 */
export interface SelectedMemories {
  memories: Memory[];
  breakdowns: Record<string, ScoreBreakdown>;
  fromFallback: boolean;
  totalMemoryCount: number;
}

/**
 * 核心打分 + 选择逻辑(不负责格式化)。
 *
 * 流程:
 * 1. 拉全量记忆(60s TTL 缓存)
 * 2. 从 terms/characters 构造 chunkEntities(关键词信号)
 * 3. 可选计算 chunk 语义向量(语义信号)
 * 4. 逐条打分 → 阈值过滤 → 字符预算填充
 * 5. 空选择时兜底 getRecentMemories(5)
 *
 * 同时写入 `lastScoreBreakdownsByBook`,供 translation-service 读取。
 */
function buildChunkEntities(
  terms: Terminology[] | undefined,
  characters: CharacterSetting[] | undefined,
): Array<{ name: string }> {
  const out: Array<{ name: string }> = [];
  if (terms) {
    for (const t of terms) {
      if (t?.name) out.push({ name: t.name });
    }
  }
  if (characters) {
    for (const c of characters) {
      if (c?.name) out.push({ name: c.name });
      if (c?.aliases) {
        for (const alias of c.aliases) {
          if (alias?.name) out.push({ name: alias.name });
        }
      }
    }
  }
  return out;
}

function readMemoryInjectionBudget(): { charBudget: number; minScore: number } {
  let charBudget = DEFAULT_CHAR_BUDGET;
  let minScore = DEFAULT_MIN_SCORE;
  try {
    const settings = useSettingsStore();
    const cfg = settings.settings?.memoryInjection;
    if (cfg?.charBudget && cfg.charBudget > 0) charBudget = cfg.charBudget;
    if (typeof cfg?.minScoreThreshold === 'number') minScore = cfg.minScoreThreshold;
  } catch {
    /* 保持默认 */
  }
  return { charBudget, minScore };
}

function collectBreakdownsForMemories(
  memories: Memory[],
  scored: ScoredMemory[],
): Record<string, ScoreBreakdown> {
  const breakdowns: Record<string, ScoreBreakdown> = {};
  const scoredById = new Map(scored.map((s) => [s.memory.id, s.breakdown]));
  for (const mem of memories) {
    const bd = scoredById.get(mem.id);
    if (bd) breakdowns[mem.id] = bd;
  }
  return breakdowns;
}

export async function selectRelevantMemoriesForChunk(
  bookId: string,
  chunkText: string,
  existingTerms?: Terminology[],
  existingCharacters?: CharacterSetting[],
): Promise<SelectedMemories> {
  const empty: SelectedMemories = {
    memories: [],
    breakdowns: {},
    fromFallback: false,
    totalMemoryCount: 0,
  };
  if (!bookId || !chunkText) return empty;

  const allMemories = await MemoryService.getAllBookMemories(bookId);
  if (allMemories.length === 0) return empty;

  const chunkEntities = buildChunkEntities(existingTerms, existingCharacters);
  const chunkEmbedding = await computeChunkEmbedding(chunkText);
  const scored: ScoredMemory[] = scoreMemoriesBatch(allMemories, {
    chunkEntities,
    chunkEmbedding: chunkEmbedding ?? undefined,
    now: Date.now(),
    expectedModelVersion: chunkEmbedding ? MODEL_VERSION : undefined,
  });

  const { charBudget, minScore } = readMemoryInjectionBudget();
  const memories = selectByBudget(scored, charBudget, HARD_ITEM_CAP, minScore);
  const breakdowns = collectBreakdownsForMemories(memories, scored);

  lastScoreBreakdownsByBook.set(bookId, breakdowns);

  return {
    memories,
    breakdowns,
    fromFallback: false,
    totalMemoryCount: allMemories.length,
  };
}

/**
 * 获取与 chunk 相关的记忆 — 格式化为 AI prompt 注入字符串。
 * 与 UI 预览共享 `selectRelevantMemoriesForChunk`,保证"注入内容 = 预览内容"。
 *
 * @returns 格式化字符串,形如 `\n\n【相关记忆】\n  - [id] summary\n  - [id] summary`
 */
export async function getRelatedMemoriesForChunk(
  bookId: string,
  chunkText: string,
  _maxMemories: number = 15,
  _chapterId?: string,
  existingTerms?: Terminology[],
  existingCharacters?: CharacterSetting[],
): Promise<string> {
  if (!bookId || !chunkText) return '';

  try {
    const { memories, breakdowns, fromFallback, totalMemoryCount } =
      await selectRelevantMemoriesForChunk(bookId, chunkText, existingTerms, existingCharacters);

    if (memories.length === 0) return '';

    const logLines = memories.map((m) => {
      const bd = breakdowns[m.id];
      const score = bd ? bd.total.toFixed(2) : '?';
      const details = bd
        ? `sem=${bd.semantic.toFixed(2)} kw=${bd.keyword.toFixed(2)} rec=${bd.recency.toFixed(2)}`
        : 'fallback';
      return `  ${m.id} [${score}] (${details}) ${m.summary.slice(0, 40)}`;
    });
    console.debug(
      `[context-builder] 注入 ${memories.length}/${totalMemoryCount} 条记忆${fromFallback ? ' (LRU 兜底)' : ''}:\n${logLines.join('\n')}`,
    );

    const lines = memories.map((m) => `  - [${m.id}] ${m.summary}`);
    return `\n\n【相关记忆】\n${lines.join('\n')}`;
  } catch (error) {
    console.warn('[context-builder] 三信号打分失败,退回 legacy LRU:', error);
    return getRelatedMemoriesForChunkLegacy(bookId, chunkText, 15);
  }
}

/**
 * 构建独立的 chunk 提示（避免 max token 问题）
 * 每个 chunk 独立，提醒 AI 使用工具获取上下文
 * @param taskType 任务类型
 * @param chunkIndex 当前 chunk 索引（从 0 开始）
 * @param totalChunks 总 chunk 数
 * @param chunkText chunk 文本内容
 * @param paragraphCountNote 段落数量提示
 * @param maintenanceReminder 维护提醒
 * @param chapterId 章节 ID（可选）
 * @param chapterTitle 章节标题（可选，仅第一个 chunk）
 * @param bookId 书籍 ID（可选，用于提取当前 chunk 中的术语和角色）
 * @param hasPreviousParagraphs 当前 chunk 的起始段落之前是否还有本章节的段落（可选）
 * @param firstParagraphId 当前 chunk 的第一个段落 ID（可选）
 * @returns 独立的 chunk 提示
 */
export async function buildIndependentChunkPrompt(
  taskType: TaskType,
  chunkIndex: number,
  totalChunks: number,
  chunkText: string,
  paragraphCountNote: string,
  maintenanceReminder: string,
  chapterId?: string,
  chapterTitle?: string,
  bookId?: string,
  hasPreviousParagraphs?: boolean,
  firstParagraphId?: string,
): Promise<string> {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  // 工具提示：避免与 system prompt 重复，只保留最小必要提醒
  const contextToolsReminder = `\n\n[警告] **上下文获取**：如需上下文信息可调用工具获取；工具返回内容**不要**当作${taskLabel}结果直接输出。`;

  // 提取当前 chunk 中出现的术语和角色
  // 注意：每次调用时都从 store 重新获取书籍数据，确保包含在前一个 chunk 中创建/更新的术语和角色
  let currentChunkContext = '';
  if (bookId && chunkText) {
    const booksStore = useBooksStore();
    // 从 store 获取最新的书籍数据（包含所有已创建/更新的术语和角色）
    const book = booksStore.getBookById(bookId);
    if (book) {
      // 从当前 chunk 文本中提取出现的术语和角色
      // 这会自动包含在前一个 chunk 中创建的新术语和角色（因为它们已经在 store 中更新了）
      const terms = findUniqueTermsInText(chunkText, book.terminologies || []);
      const characters = findUniqueCharactersInText(chunkText, book.characterSettings || []);

      const contextParts: string[] = [];

      if (terms.length > 0) {
        const termList = terms.map((t) => `${t.name} → ${t.translation.translation}`).join('、');
        contextParts.push(`**术语**：${termList}`);
      }

      if (characters.length > 0) {
        const characterDetails = characters.map(formatCharacterDetail);

        contextParts.push(`**角色**：\n${characterDetails.map((d) => `  - ${d}`).join('\n')}`);
      }

      if (contextParts.length > 0) {
        currentChunkContext = `\n\n【当前部分出现的术语和角色】\n${contextParts.join('\n')}\n`;
        currentChunkContext += `提供的角色以及术语信息已为最新，不必使用工具再次获取检查。\n`;
      }

      // 获取相关记忆
      // 传入已提取的 terms 和 characters，避免重复计算
      const memoryContext = await getRelatedMemoriesForChunk(
        bookId,
        chunkText,
        10,
        chapterId,
        terms,
        characters,
      );
      if (memoryContext) {
        currentChunkContext += memoryContext;
      }
    }
  }

  // 起始段落提示：当本次任务从章节中间开始（即起始段落不是章节第一个非空段落）时，提醒 AI 可用工具取前文
  const startContextHint =
    hasPreviousParagraphs === true && firstParagraphId
      ? `\n\n【起始段落位置】\n**起始段落ID**: \`${firstParagraphId}\`\n[提示] 在此之前还有段落。如需前文上下文，可调用 \`get_previous_paragraphs\`（参数 \`paragraph_id\` 传入起始段落ID）。仅用于上下文，不要把工具返回内容当作${taskLabel}结果输出。\n`
      : '';

  // 第一个 chunk：完整规划阶段
  // 注意：章节 ID 已在系统提示词中提供
  if (chunkIndex === 0) {
    // 如果有章节标题，添加明确的翻译指令
    const titleInstruction =
      chapterTitle && taskType === 'translation'
        ? `\n\n**章节标题翻译**：请翻译以下章节标题，并在输出 JSON 中包含 \`titleTranslation\` 字段：
【章节标题】${chapterTitle}`
        : '';

    const planningStatus = getCurrentStatusInfo(taskType, 'planning', false);

    return `开始${taskLabel}任务。当前处于 **planning 阶段**，请按待办清单逐项完成。

${planningStatus}${titleInstruction}${currentChunkContext}${startContextHint}

以下是第一部分内容（第 ${chunkIndex + 1}/${totalChunks} 部分）：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}${contextToolsReminder}`;
  } else {
    // 后续 chunk：简短规划阶段，包含当前 chunk 中出现的术语和角色
    const briefPlanningNote = currentChunkContext
      ? '以上是当前部分中出现的术语和角色，请确保翻译时使用这些术语和角色的正确翻译。'
      : '';

    const briefPlanningStatus = getCurrentStatusInfo(taskType, 'planning', true);

    return `继续${taskLabel}任务（第 ${chunkIndex + 1}/${totalChunks} 部分）。当前处于 **planning 阶段**。${currentChunkContext}${startContextHint}

${briefPlanningStatus}
${briefPlanningNote}

以下是待${taskLabel}内容：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}`;
  }
}

/**
 * 构建特殊指令部分（用于系统提示词）
 * @param specialInstructions 特殊指令字符串（如果存在）
 * @returns 格式化的特殊指令部分，如果没有则返回空字符串
 */
export function buildSpecialInstructionsSection(specialInstructions?: string): string {
  return specialInstructions
    ? `\n\n========================================\n【特殊指令（用户自定义）】\n========================================\n${specialInstructions}\n`
    : '';
}

/**
 * 获取特殊指令（书籍级别或章节级别）
 * @param bookId 书籍 ID
 * @param chapterId 章节 ID
 * @param taskType 任务类型
 * @returns 特殊指令字符串（如果存在）
 */
export function getSpecialInstructions(
  bookId: string | undefined,
  chapterId: string | undefined,
  taskType: TaskType,
): string | undefined {
  if (!bookId) {
    return undefined;
  }

  try {
    // 动态导入 store 以避免循环依赖
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);

    if (!book) {
      return undefined;
    }

    // 如果提供了章节ID，获取章节数据以获取章节级别的特殊指令
    let chapter;
    if (chapterId) {
      for (const volume of book.volumes || []) {
        const foundChapter = volume.chapters?.find((c) => c.id === chapterId);
        if (foundChapter) {
          chapter = foundChapter;
          break;
        }
      }
    }

    // 根据任务类型获取相应的特殊指令（章节级别覆盖书籍级别）
    switch (taskType) {
      case 'translation':
        return chapter?.translationInstructions || book.translationInstructions;
      case 'polish':
        return chapter?.polishInstructions || book.polishInstructions;
      case 'proofreading':
        return chapter?.proofreadingInstructions || book.proofreadingInstructions;
      default:
        return undefined;
    }
  } catch (e) {
    console.warn(
      `[getSpecialInstructions] ⚠️ 获取书籍数据失败（书籍ID: ${bookId}）`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/**
 * 构建前后段落上下文（用于单段落润色/校对）
 * @param currentParagraphId 当前段落 ID
 * @param allParagraphs 全章段落数组
 * @param count 前后各取多少段（默认 3）
 */
function buildSurroundingParagraphsContext(
  currentParagraphId: string,
  allParagraphs: Paragraph[],
  count: number = 3,
): string {
  const currentIndex = allParagraphs.findIndex((p) => p.id === currentParagraphId);
  if (currentIndex === -1) return '';

  const formatParagraph = (p: Paragraph): string => {
    const translation = getSelectedTranslation(p);
    const translationPart = translation ? `\n  翻译: ${translation}` : '';
    return `[ID: ${p.id}] 原文: ${p.text}${translationPart}`;
  };

  const parts: string[] = [];

  // 前面的段落
  const prevStart = Math.max(0, currentIndex - count);
  const prevParagraphs = allParagraphs.slice(prevStart, currentIndex).filter((p) => p.text?.trim());
  if (prevParagraphs.length > 0) {
    parts.push('【前文段落】');
    parts.push(...prevParagraphs.map(formatParagraph));
  }

  // 后面的段落
  const nextParagraphs = allParagraphs
    .slice(currentIndex + 1, currentIndex + 1 + count)
    .filter((p) => p.text?.trim());
  if (nextParagraphs.length > 0) {
    parts.push('【后文段落】');
    parts.push(...nextParagraphs.map(formatParagraph));
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n') + '\n' : '';
}

/**
 * 将角色别名数组格式化为 `别名：alias1 → 翻译1、alias2 → 翻译2` 形式的单行片段。
 * 空/未定义别名时返回 null，由调用方决定是否输出占位符（例如"别名：无"）。
 *
 * 供 context-builder 与 term-translation-service 等多处复用，保证别名格式一致。
 */
export function formatCharacterAliases(
  aliases: CharacterSetting['aliases'] | undefined,
): string | null {
  if (!aliases || aliases.length === 0) return null;
  const aliasList = aliases.map((a) => `${a.name} → ${a.translation.translation}`).join('、');
  return `别名：${aliasList}`;
}

/**
 * 将单个角色格式化为单行详情字符串：`name → translation | 性别：... | 描述：... | 说话风格：... | 别名：...`
 * 仅在文件内部使用，供多个上下文构建器复用，保证角色信息格式一致
 */
function formatCharacterDetail(c: CharacterSetting): string {
  const sexLabels: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他',
  };

  const parts: string[] = [];
  parts.push(`${c.name} → ${c.translation.translation}`);

  if (c.sex) {
    parts.push(`性别：${sexLabels[c.sex] || c.sex}`);
  }

  if (c.description) {
    parts.push(`描述：${c.description}`);
  }

  if (c.speakingStyle) {
    parts.push(`说话风格：${c.speakingStyle}`);
  }

  const aliasPart = formatCharacterAliases(c.aliases);
  if (aliasPart) {
    parts.push(aliasPart);
  }

  return parts.join(' | ');
}

/**
 * 构建章节角色上下文（用于单段落润色/校对）
 * @param characters 本章出场的角色列表
 */
function buildChapterCharactersContext(characters: CharacterSetting[]): string {
  if (!characters || characters.length === 0) return '';

  const characterDetails = characters.map((c) => `  - ${formatCharacterDetail(c)}`);

  return `\n\n【本章出场角色】\n${characterDetails.join('\n')}\n`;
}

/**
 * 构建单段落润色/校对的完整默认上下文
 */
export async function buildSingleParagraphDefaultContext(options: {
  currentParagraphId: string;
  allChapterParagraphs: Paragraph[];
  bookId?: string;
  chapterId?: string;
  chapterTitle?: string;
}): Promise<string> {
  const { currentParagraphId, allChapterParagraphs, bookId, chapterId, chapterTitle } = options;

  const parts: string[] = [];

  // 1. 书籍信息
  if (bookId) {
    const bookContext = await buildBookContextSection(bookId);
    if (bookContext) parts.push(bookContext);
  }

  // 2. 章节信息
  const chapterContext = buildChapterContextSection(chapterId, chapterTitle);
  if (chapterContext) parts.push(chapterContext);

  // 3. 本章角色
  if (bookId) {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    if (book) {
      // 用全章段落文本匹配角色
      const allText = allChapterParagraphs.map((p) => p.text).join('\n');
      const characters = findUniqueCharactersInText(allText, book.characterSettings || []);
      const charactersContext = buildChapterCharactersContext(characters);
      if (charactersContext) parts.push(charactersContext);
    }
  }

  // 4. 相关术语（基于当前段落文本匹配）
  if (bookId) {
    const booksStore = useBooksStore();
    const book = booksStore.getBookById(bookId);
    const currentParagraph = allChapterParagraphs.find((p) => p.id === currentParagraphId);
    if (book && currentParagraph?.text) {
      const terms = findUniqueTermsInText(currentParagraph.text, book.terminologies || []);
      if (terms.length > 0) {
        const termList = terms
          .map(
            (t) =>
              `- ${t.name} → ${t.translation.translation}${t.description ? `: ${t.description}` : ''}`,
          )
          .join('\n');
        parts.push(`\n\n【相关术语】\n${termList}\n`);
      }
    }
  }

  // 5. 前后段落上下文
  const surroundingContext = buildSurroundingParagraphsContext(
    currentParagraphId,
    allChapterParagraphs,
  );
  if (surroundingContext) parts.push(surroundingContext);

  return parts.join('');
}
