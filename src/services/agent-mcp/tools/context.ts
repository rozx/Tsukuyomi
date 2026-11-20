import type { AppLocale } from 'src/models/locale';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import { getLanguageTranslation, getNameTranslation } from 'src/services/localization/selection';
import { titleOriginal } from 'src/services/localization/title-edit';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { isElectron } from 'src/utils/platform';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';
import { getAgentMcpPrompt, listAgentMcpPrompts } from '../prompts';
import { agentMcpError, type AgentMcpToolSpec } from '../types';
import {
  findChapterInBook,
  loadChapterParagraphs,
  readTrimmedString,
  resolveBookFromArgs,
} from './helpers';

/** 页面上划选的文字最多带回的长度 */
const MAX_SELECTED_TEXT_LENGTH = 2000;

type AppPage =
  | { kind: 'unknown'; path: string | null }
  | {
      kind:
        | 'home'
        | 'books'
        | 'book_import'
        | 'import'
        | 'ai_models'
        | 'agent_mcp'
        | 'settings'
        | 'help';
      path: string;
      help_doc_id?: string;
      import_task_id?: string;
    }
  | { kind: 'book'; path: string; book_id: string }
  | { kind: 'book_settings'; path: string; book_id: string; section: string };

const SIMPLE_PAGES: Record<string, 'home' | 'books' | 'ai_models' | 'agent_mcp' | 'settings'> = {
  '': 'home',
  books: 'books',
  ai: 'ai_models',
  mcp: 'agent_mcp',
  settings: 'settings',
};

/** 把应用内路径翻译成外部 Agent 能看懂的「用户在哪个页面」（与 src/router/routes.ts 对应） */
function describeAppPage(rawPath: string | null): AppPage {
  if (rawPath === null) return { kind: 'unknown', path: null };
  const path = rawPath.split(/[?#]/)[0] ?? '';
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const [first = '', second, third, fourth] = segments;

  if (segments.length <= 1 && first in SIMPLE_PAGES) {
    return { kind: SIMPLE_PAGES[first]!, path };
  }
  if (first === 'help') {
    return { kind: 'help', path, ...(second ? { help_doc_id: second } : {}) };
  }
  if (first === 'import') {
    return { kind: 'import', path, ...(second ? { import_task_id: second } : {}) };
  }
  if (first === 'books' && second) {
    if (second === 'new') return { kind: 'book_import', path };
    if (third === 'settings' && fourth) {
      return { kind: 'book_settings', path, book_id: second, section: fourth };
    }
    if (segments.length === 2) return { kind: 'book', path, book_id: second };
  }
  return { kind: 'unknown', path };
}

function readSelectedText(): string | null {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return null;
  const text = window.getSelection()?.toString().trim() ?? '';
  if (!text) return null;
  return text.length > MAX_SELECTED_TEXT_LENGTH
    ? `${text.slice(0, MAX_SELECTED_TEXT_LENGTH)}…`
    : text;
}

function describeParagraph(
  paragraphs: readonly Paragraph[],
  paragraphId: string | null,
  chapterId: string,
  language: AppLocale,
) {
  if (!paragraphId) return null;
  const index = paragraphs.findIndex((p) => p.id === paragraphId);
  if (index < 0) return null;
  const paragraph = paragraphs[index]!;
  return {
    id: paragraph.id,
    chapter_id: chapterId,
    index,
    text: paragraph.text,
    translation: getLanguageTranslation(paragraph, language)?.translation || null,
  };
}

/** 用户当前打开的章节，以及其中选中 / 鼠标所在的段落 */
async function describeOpenChapter(
  book: Novel | undefined,
  chapterId: string | null,
  selectedParagraphId: string | null,
  hoveredParagraphId: string | null,
) {
  const empty = { current_chapter: null, selected_paragraph: null, hovered_paragraph: null };
  if (!book || !chapterId) return empty;
  const chapter: Chapter | null = findChapterInBook(book, chapterId);
  if (!chapter) return empty;

  const language = book.targetLanguage ?? 'zh-CN';
  const paragraphs = await loadChapterParagraphs(chapter);
  const nonEmpty = paragraphs.filter((p) => p.text.trim().length > 0);
  return {
    current_chapter: {
      id: chapter.id,
      title_original: titleOriginal(chapter.title),
      title_translation:
        typeof chapter.title === 'object'
          ? (getNameTranslation(chapter.title, language)?.translation ?? '')
          : '',
      paragraph_count: nonEmpty.length,
      translated_count: nonEmpty.filter((p) =>
        Boolean(getLanguageTranslation(p, language)?.translation.trim()),
      ).length,
    },
    selected_paragraph: describeParagraph(paragraphs, selectedParagraphId, chapter.id, language),
    hovered_paragraph: describeParagraph(paragraphs, hoveredParagraphId, chapter.id, language),
  };
}

export const agentMcpContextTools: AgentMcpToolSpec[] = [
  {
    name: 'get_app_context',
    description:
      'Get what the user is currently looking at in Tsukuyomi: which page they are on, the open book and chapter (with progress), the selected paragraph with its text and translation, any text they highlighted on the page, plus UI locale, runtime environment and capability flags. Call this first when the user says "this paragraph", "this chapter", "here" or "the current book".',
    category: 'context',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (_args, ctx) => {
      const contextStore = useContextStore();
      const settingsStore = useSettingsStore();
      const booksStore = useBooksStore();
      const currentBook = contextStore.currentBookId
        ? booksStore.getBookById(contextStore.currentBookId)
        : undefined;
      const openChapter = await describeOpenChapter(
        currentBook,
        contextStore.currentChapterId,
        contextStore.selectedParagraphId,
        contextStore.hoveredParagraphId,
      );

      return {
        page: describeAppPage(ctx.getCurrentPath?.() ?? null),
        current_book_id: contextStore.currentBookId,
        current_book_title: currentBook?.title ?? null,
        current_chapter_id: contextStore.currentChapterId,
        ...openChapter,
        selected_paragraph_id: contextStore.selectedParagraphId,
        selected_text: readSelectedText(),
        ui_locale: settingsStore.uiLocale,
        target_language: currentBook?.targetLanguage ?? 'zh-CN',
        is_electron: isElectron(),
        books_loaded: booksStore.isLoaded,
        book_count: booksStore.books.length,
        local_embedding_enabled: isLocalEmbeddingEffectivelyEnabled(
          settingsStore.settings.enableLocalEmbedding,
        ),
        permission_mode: ctx.permissionMode,
        default_write_mode: ctx.defaultWriteMode,
        channel: ctx.channel,
      };
    },
  },
  {
    name: 'navigate_to',
    description:
      'Navigate the Tsukuyomi UI to home, books library, a specific book, chapter, or paragraph so the user can follow agent progress live.',
    category: 'context',
    permission: 'translate_and_edit',
    readOnlyHint: false,
    requiresBookStore: true,
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['home', 'books', 'book', 'chapter', 'paragraph'],
          description: 'Destination view type.',
        },
        book_id: {
          type: 'string',
          description: 'Target book ID (optional if a book is currently open).',
        },
        chapter_id: {
          type: 'string',
          description: 'Target chapter ID (required for chapter/paragraph navigation).',
        },
        paragraph_id: {
          type: 'string',
          description: 'Target paragraph ID (required for paragraph navigation).',
        },
      },
      required: ['target'],
    },
    execute: async (args, ctx) => {
      const target = readTrimmedString(args.target);
      const contextStore = useContextStore();
      const bookDetailsStore = useBookDetailsStore();

      if (target === 'home') {
        await ctx.navigate?.('/');
        return { navigated: true, path: '/' };
      }
      if (target === 'books') {
        await ctx.navigate?.('/books');
        return { navigated: true, path: '/books' };
      }

      if (target !== 'book' && target !== 'chapter' && target !== 'paragraph') {
        return agentMcpError('INVALID_TARGET', `Unsupported navigation target: ${target}`);
      }

      const bookRes = resolveBookFromArgs(args, ctx);
      if (!bookRes.ok) return bookRes.error;
      const { book } = bookRes;

      const chapterId = readTrimmedString(args.chapter_id);
      const paragraphId = readTrimmedString(args.paragraph_id);

      if ((target === 'chapter' || target === 'paragraph') && !chapterId) {
        return agentMcpError(
          'CHAPTER_ID_REQUIRED',
          'chapter_id is required when target is "chapter" or "paragraph".',
        );
      }
      if (target === 'paragraph' && !paragraphId) {
        return agentMcpError(
          'PARAGRAPH_ID_REQUIRED',
          'paragraph_id is required when target is "paragraph".',
        );
      }

      if (chapterId) {
        const chapter = findChapterInBook(book, chapterId);
        if (!chapter) {
          return agentMcpError('CHAPTER_NOT_FOUND', `Chapter not found: ${chapterId}`);
        }
        if (target === 'paragraph') {
          const paragraphs = await loadChapterParagraphs(chapter);
          if (!paragraphs.some((p) => p.id === paragraphId)) {
            return agentMcpError('PARAGRAPH_NOT_FOUND', `Paragraph not found: ${paragraphId}`);
          }
        }
        bookDetailsStore.setSelectedChapter(book.id, chapterId);
        if (target === 'paragraph') {
          bookDetailsStore.requestParagraphNavigation({
            bookId: book.id,
            chapterId,
            paragraphId,
          });
        } else {
          bookDetailsStore.clearPendingParagraphNavigation();
        }
      } else {
        bookDetailsStore.clearPendingParagraphNavigation();
      }

      contextStore.setCurrentBook(book.id);
      if (chapterId) {
        contextStore.setCurrentChapter(chapterId);
      }
      if (target === 'paragraph' && paragraphId) {
        contextStore.setSelectedParagraph(paragraphId);
      }

      const path = `/books/${book.id}`;
      await ctx.navigate?.(path);
      return {
        navigated: true,
        path,
        book_id: book.id,
        ...(chapterId ? { chapter_id: chapterId } : {}),
        ...(paragraphId ? { paragraph_id: paragraphId } : {}),
      };
    },
  },
  {
    name: 'get_workflow_guide',
    description:
      'Retrieve Tsukuyomi standard agent workflow instructions for translate-chapter, polish-chapter, or import-and-translate.',
    category: 'context',
    permission: 'read_only',
    readOnlyHint: true,
    webMcpOnly: true,
    requiresBookStore: false,
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'string',
          enum: ['translate-chapter', 'polish-chapter', 'import-and-translate'],
          description: 'Workflow name to retrieve.',
        },
        book_id: { type: 'string', description: 'Optional target book ID.' },
        chapter_id: { type: 'string', description: 'Optional target chapter ID.' },
        model_label: { type: 'string', description: 'Optional model label.' },
        write_mode: { type: 'string', enum: ['append', 'overwrite'] },
        source: { type: 'string', description: 'Optional import source.' },
        target_language: { type: 'string', enum: ['zh-CN', 'zh-TW', 'en-US'] },
      },
      required: ['workflow'],
    },
    execute: (args) => {
      const workflow = readTrimmedString(args.workflow);
      const prompt = getAgentMcpPrompt(workflow, {
        book_id: typeof args.book_id === 'string' ? args.book_id : undefined,
        chapter_id: typeof args.chapter_id === 'string' ? args.chapter_id : undefined,
        model_label: typeof args.model_label === 'string' ? args.model_label : undefined,
        write_mode: typeof args.write_mode === 'string' ? args.write_mode : undefined,
        source: typeof args.source === 'string' ? args.source : undefined,
        target_language:
          typeof args.target_language === 'string' ? args.target_language : undefined,
      });
      if (!prompt) {
        return agentMcpError('UNKNOWN_WORKFLOW', `Unknown workflow: ${workflow}`, {
          available_workflows: listAgentMcpPrompts().map((p) => p.name),
        });
      }
      return {
        workflow,
        description: prompt.description,
        guide: prompt.messages.map((m) => m.content.text).join('\n\n'),
      };
    },
  },
];
