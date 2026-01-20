import { ChapterContentService } from 'src/services/chapter-content-service';
import { TASK_TYPE_LABELS, type TaskType, MAX_DESC_LEN } from './task-types';
import { getChunkingInstructions } from '../prompts';
import { getPostToolCallReminder } from './todo-helper';
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
    chapter_summary: '',
  };
  return reminders[taskType];
}

/**
 * 构建初始用户提示的基础部分 - 精简版
 */
export function buildInitialUserPromptBase(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const chunkingInstructions = getChunkingInstructions(taskType);
  return `开始${taskLabel}。

${chunkingInstructions}`;
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
 * 添加章节上下文到初始提示
 * 注意：工具使用说明已在系统提示词中提供，这里只保留章节ID和简要提醒
 */
export function addChapterContext(
  prompt: string,
  chapterId: string,
  _taskType: TaskType,
  chapterTitle?: string,
): string {
  const titleLine = chapterTitle ? `**当前章节标题**: ${chapterTitle}\n` : '';
  return (
    `${prompt}\n\n**当前章节 ID**: \`${chapterId}\`\n${titleLine}` +
    `[警告] **重要提醒**: 工具**仅用于获取上下文信息**，你只需要处理**当前任务中直接提供给你的段落**。`
  );
}

/**
 * 添加段落上下文到初始提示
 */
export function addParagraphContext(
  prompt: string,
  paragraphId: string,
  taskType: TaskType,
): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];

  const tools =
    taskType === 'proofreading'
      ? 'find_paragraph_by_keywords、get_chapter_info、get_previous_paragraphs、get_next_paragraphs'
      : 'find_paragraph_by_keywords、get_chapter_info';

  return (
    `${prompt}\n\n**当前段落 ID**: ${paragraphId}\n` +
    `你可以使用工具（如 ${tools} 等）获取该段落的前后上下文，` +
    `以确保${taskLabel}的一致性和连贯性。\n\n` +
    `[警告] **重要提醒**: 这些工具**仅用于获取上下文信息**，` +
    `不要用来获取待${taskLabel}的段落！你只需要处理**当前任务中直接提供给你的段落**，` +
    `不要尝试翻译工具返回的段落内容。`
  );
}

/**
 * 添加任务规划建议到初始提示 - 精简版
 */
export function addTaskPlanningSuggestions(prompt: string, _taskType: TaskType): string {
  return `${prompt}\n\n可用 \`create_todo\` 规划复杂任务`;
}

/**
 * 构建执行要点/清单（任务特定）- 精简版
 */
export function buildExecutionSection(taskType: TaskType, chapterId?: string): string {
  const chapterNote = chapterId ? `（传chapter_id: ${chapterId}）` : '';

  if (taskType === 'translation') {
    return `\n【执行】planning→获取上下文${chapterNote} | working→1:1翻译 | review→复核 | end`;
  }

  if (taskType === 'proofreading') {
    return `\n【执行】只返回有变化段落，忽略空段落`;
  }

  if (taskType === 'polish') {
    return `\n【执行】只返回有变化段落${chapterNote}，参考历史翻译`;
  }

  return '';
}

/**
 * 构建输出内容后的后续操作提示 - 精简版
 */
export function buildPostOutputPrompt(taskType: TaskType, taskId?: string): string {
  const todosReminder = taskId ? getPostToolCallReminder(undefined, taskId) : '';

  // 翻译相关任务：在 review 阶段额外提醒可回到 working 更新既有译文
  const canGoBackToWorkingReminder =
    taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading'
      ? '如果你想更新任何已输出的译文/润色/校对结果，请将状态改回 `{"status":"working"}` 并只返回需要更新的段落；'
      : '';

  return `完成。${todosReminder}${canGoBackToWorkingReminder}如需后续操作请调用工具，否则返回 \`{"status": "end"}\``;
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
export function buildIndependentChunkPrompt(
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
): string {
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
        const characterDetails = characters.map((c) => {
          const parts: string[] = [];
          parts.push(`${c.name} → ${c.translation.translation}`);

          if (c.sex) {
            const sexLabels: Record<string, string> = {
              male: '男',
              female: '女',
              other: '其他',
            };
            parts.push(`性别：${sexLabels[c.sex] || c.sex}`);
          }

          if (c.description) {
            parts.push(`描述：${c.description}`);
          }

          if (c.speakingStyle) {
            parts.push(`说话风格：${c.speakingStyle}`);
          }

          if (c.aliases && c.aliases.length > 0) {
            const aliasList = c.aliases
              .map((a) => `${a.name} → ${a.translation.translation}`)
              .join('、');
            parts.push(`别名：${aliasList}`);
          }

          return parts.join(' | ');
        });

        contextParts.push(`**角色**：\n${characterDetails.map((d) => `  - ${d}`).join('\n')}`);
      }

      if (contextParts.length > 0) {
        currentChunkContext = `\n\n【当前部分出现的术语和角色】\n${contextParts.join('\n')}\n`;
        currentChunkContext += `提供的角色以及术语信息已为最新，不必使用工具再次获取检查。\n`;
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

    return `开始${taskLabel}任务。如需上下文可先调用工具；准备好后返回 \`{"status":"working", ...}\` 并开始${taskLabel}。${titleInstruction}${currentChunkContext}${startContextHint}

以下是第一部分内容（第 ${chunkIndex + 1}/${totalChunks} 部分）：${paragraphCountNote}\n\n${chunkText}${maintenanceReminder}${contextToolsReminder}`;
  } else {
    // 后续 chunk：简短规划阶段，包含当前 chunk 中出现的术语和角色
    const briefPlanningNote = currentChunkContext
      ? '以上是当前部分中出现的术语和角色，请确保翻译时使用这些术语和角色的正确翻译。'
      : '';

    return `继续${taskLabel}任务（第 ${chunkIndex + 1}/${totalChunks} 部分）。${currentChunkContext}${startContextHint}

**[警告] 重要：简短规划阶段（已继承上文规划）**
${briefPlanningNote}请直接将状态设置为 "working" 并开始${taskLabel}。

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
export async function getSpecialInstructions(
  bookId: string | undefined,
  chapterId: string | undefined,
  taskType: TaskType,
): Promise<string | undefined> {
  if (!bookId) {
    return undefined;
  }

  try {
    // 动态导入 store 以避免循环依赖
    await Promise.resolve(); // 保持 async 签名兼容性
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
