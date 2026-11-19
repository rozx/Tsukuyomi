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

export const agentMcpContextTools: AgentMcpToolSpec[] = [
  {
    name: 'get_app_context',
    description:
      'Get current Tsukuyomi application context: currently open book/chapter/paragraph IDs, UI locale, runtime environment (desktop/web), and capability flags.',
    category: 'context',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: (_args, ctx) => {
      const contextStore = useContextStore();
      const settingsStore = useSettingsStore();
      const booksStore = useBooksStore();
      const currentBook = contextStore.currentBookId
        ? booksStore.getBookById(contextStore.currentBookId)
        : undefined;

      return {
        current_book_id: contextStore.currentBookId,
        current_book_title: currentBook?.title ?? null,
        current_chapter_id: contextStore.currentChapterId,
        selected_paragraph_id: contextStore.selectedParagraphId,
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
