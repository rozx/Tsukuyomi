import { agentText } from 'src/i18n/translate';
import { BookService } from 'src/services/book-service';
import { ChapterService } from 'src/services/chapter-service';
import { useBooksStore } from 'src/stores/books';
import type { Chapter, Novel } from 'src/models/novel';
import { caughtToolErrorJson, toolErrorJson } from './tool-feedback';
import { describeTool, toolDefinition } from './tool-localization';
import { parseToolArgs, type ToolDefinition } from './types';

/**
 * 书籍级 / 章节级特殊指令（翻译 / 润色 / 校对）的查看与修改工具。
 * 仅提供给聊天助手：用户发现译法问题时，助手把纠正规则写进指令，影响后续任务。
 */

const INSTRUCTION_TASKS = ['translation', 'polish', 'proofreading'] as const;
type InstructionTask = (typeof INSTRUCTION_TASKS)[number];

const INSTRUCTION_FIELDS = {
  translation: 'translationInstructions',
  polish: 'polishInstructions',
  proofreading: 'proofreadingInstructions',
} as const satisfies Record<InstructionTask, keyof Novel & keyof Chapter>;

type InstructionHolder = Partial<
  Record<(typeof INSTRUCTION_FIELDS)[InstructionTask], string | undefined>
>;

function readInstructions(holder: InstructionHolder): Record<InstructionTask, string> {
  return {
    translation: holder.translationInstructions ?? '',
    polish: holder.polishInstructions ?? '',
    proofreading: holder.proofreadingInstructions ?? '',
  };
}

/** append 模式按行追加，原指令为空时不留多余换行 */
function mergeInstructions(previous: string, addition: string, mode: 'append' | 'replace') {
  const next = addition.trim();
  if (mode === 'replace' || !previous.trim()) return next;
  return `${previous.trimEnd()}\n${next}`;
}

async function loadBook(bookId: string | undefined) {
  if (!bookId) return { error: toolErrorJson('BOOK_ID_REQUIRED', 'aiEntityFeedback.bookRequired') };
  const book = await BookService.getBookById(bookId);
  if (!book) {
    return {
      error: toolErrorJson('BOOK_NOT_FOUND', 'aiEntityFeedback.bookMissing', { id: bookId }),
    };
  }
  return { book };
}

function findChapter(book: Novel, chapterId: string) {
  const found = ChapterService.findChapterById(book, chapterId);
  if (found) return { chapter: found.chapter };
  return {
    error: toolErrorJson('CHAPTER_NOT_FOUND', 'aiEntityFeedback.chapterMissing', {
      id: chapterId,
    }),
  };
}

type UpdateArgs = {
  scope?: unknown;
  chapter_id?: unknown;
  task?: unknown;
  mode?: unknown;
  instructions?: unknown;
};

/** 校验 update_special_instructions 参数，返回错误 JSON 或规范化后的参数 */
function validateUpdateArgs(args: UpdateArgs):
  | { error: string }
  | {
      scope: 'book' | 'chapter';
      chapterId: string | undefined;
      task: InstructionTask;
      mode: 'append' | 'replace';
      instructions: string;
    } {
  const { scope, chapter_id, task, mode = 'append', instructions } = args;
  if (scope !== 'book' && scope !== 'chapter') {
    return { error: toolErrorJson('INVALID_SCOPE', 'aiBookFeedback.instructionScopeInvalid') };
  }
  if (!INSTRUCTION_TASKS.includes(task as InstructionTask)) {
    return { error: toolErrorJson('INVALID_TASK', 'aiBookFeedback.instructionTaskInvalid') };
  }
  if (mode !== 'append' && mode !== 'replace') {
    return { error: toolErrorJson('INVALID_MODE', 'aiBookFeedback.instructionModeInvalid') };
  }
  // append 必须有内容；replace 允许空串以清除指令
  if (typeof instructions !== 'string' || (mode === 'append' && !instructions.trim())) {
    return { error: toolErrorJson('INSTRUCTIONS_REQUIRED', 'aiBookFeedback.instructionsRequired') };
  }
  if (scope === 'chapter' && (typeof chapter_id !== 'string' || !chapter_id)) {
    return { error: toolErrorJson('CHAPTER_ID_REQUIRED', 'aiEntityFeedback.chapterRequired') };
  }
  return {
    scope,
    chapterId: typeof chapter_id === 'string' ? chapter_id : undefined,
    task: task as InstructionTask,
    mode,
    instructions,
  };
}

export const specialInstructionTools: ToolDefinition[] = [
  {
    definition: toolDefinition('get_special_instructions', {
      type: 'object',
      properties: {
        chapter_id: {
          type: 'string',
          description: describeTool('get_special_instructions.parameters.properties.chapter_id'),
        },
      },
      required: [],
    }),
    handler: async (args, { bookId, onAction }) => {
      const { chapter_id } = parseToolArgs<{ chapter_id?: string }>(args);
      const loaded = await loadBook(bookId);
      if ('error' in loaded) return loaded.error;
      const { book } = loaded;
      try {
        let chapterInstructions: Record<string, string> | undefined;
        if (chapter_id) {
          const found = findChapter(book, chapter_id);
          if ('error' in found) return found.error;
          chapterInstructions = { chapter_id, ...readInstructions(found.chapter) };
        }
        onAction?.({
          type: 'read',
          entity: 'book',
          data: { book_id: book.id, tool_name: 'get_special_instructions' },
        });
        return JSON.stringify({
          success: true,
          book_instructions: readInstructions(book),
          ...(chapterInstructions ? { chapter_instructions: chapterInstructions } : {}),
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          'INSTRUCTIONS_GET_FAILED',
          'aiBookFeedback.instructionsGetFailed',
        );
      }
    },
  },
  {
    definition: toolDefinition('update_special_instructions', {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['book', 'chapter'],
          description: describeTool('update_special_instructions.parameters.properties.scope'),
        },
        chapter_id: {
          type: 'string',
          description: describeTool('update_special_instructions.parameters.properties.chapter_id'),
        },
        task: {
          type: 'string',
          enum: [...INSTRUCTION_TASKS],
          description: describeTool('update_special_instructions.parameters.properties.task'),
        },
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description: describeTool('update_special_instructions.parameters.properties.mode'),
        },
        instructions: {
          type: 'string',
          description: describeTool(
            'update_special_instructions.parameters.properties.instructions',
          ),
        },
      },
      required: ['scope', 'task', 'instructions'],
    }),
    handler: async (args, { bookId, onAction }) => {
      const params = validateUpdateArgs(parseToolArgs<UpdateArgs>(args));
      if ('error' in params) return params.error;
      const loaded = await loadBook(bookId);
      if ('error' in loaded) return loaded.error;
      const { book } = loaded;
      const field = INSTRUCTION_FIELDS[params.task];
      try {
        const booksStore = useBooksStore();
        let previous: string;
        let next: string;
        if (params.scope === 'chapter') {
          const found = findChapter(book, params.chapterId!);
          if ('error' in found) return found.error;
          previous = found.chapter[field] ?? '';
          next = mergeInstructions(previous, params.instructions, params.mode);
          const volumes = ChapterService.updateChapter(book, params.chapterId!, { [field]: next });
          await booksStore.updateBook(book.id, { volumes, lastEdited: new Date() });
        } else {
          previous = book[field] ?? '';
          next = mergeInstructions(previous, params.instructions, params.mode);
          await booksStore.updateBook(book.id, { [field]: next, lastEdited: new Date() });
        }
        onAction?.({
          type: 'update',
          entity: params.scope,
          data: {
            book_id: book.id,
            ...(params.chapterId ? { chapter_id: params.chapterId } : {}),
            tool_name: 'update_special_instructions',
          },
        });
        return JSON.stringify({
          success: true,
          message: agentText('aiBookFeedback.instructionsUpdated'),
          scope: params.scope,
          ...(params.chapterId ? { chapter_id: params.chapterId } : {}),
          task: params.task,
          old_instructions: previous,
          new_instructions: next,
        });
      } catch (error) {
        return caughtToolErrorJson(
          error,
          'INSTRUCTIONS_UPDATE_FAILED',
          'aiBookFeedback.instructionsUpdateFailed',
        );
      }
    },
  },
];
