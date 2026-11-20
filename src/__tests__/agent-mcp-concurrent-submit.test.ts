import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Novel, Paragraph } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { getLanguageTranslation } from 'src/services/localization/selection';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpTranslationTools } from 'src/services/agent-mcp/tools/translation';

const PARAGRAPH_COUNT = 90;
const BATCH_SIZE = 30;

function paragraphId(i: number): string {
  return `p${String(i).padStart(7, '0')}`;
}

function createBook(): Novel {
  const now = new Date();
  const content: Paragraph[] = Array.from({ length: PARAGRAPH_COUNT }, (_, i) => ({
    id: paragraphId(i),
    text: `第${i}段の原文です。`,
    selectedTranslationId: '',
    translations: [],
  }));
  return {
    id: 'book-concurrent',
    title: '并发提交',
    targetLanguage: 'zh-CN',
    volumes: [
      {
        id: 'vol-1',
        title: '第一卷',
        chapters: [
          {
            id: 'ch-1',
            title: {
              original: '第6話',
              translation: { id: 'cht-1', translation: '', aiModelId: '' },
            },
            contentLoaded: true,
            content,
            createdAt: now,
            lastEdited: now,
          },
        ],
      },
    ],
    createdAt: now,
    lastEdited: now,
  };
}

function batch(start: number) {
  return Array.from({ length: BATCH_SIZE }, (_, k) => ({
    paragraph_id: paragraphId(start + k),
    translated_text: `第${start + k}段的译文。`,
  }));
}

describe('同一章节并发 submit_translations', () => {
  it('章节译文与标题写入对同一本书按顺序执行', () => {
    const queued = agentMcpTranslationTools
      .filter((tool) => tool.serializeWritesPerBook)
      .map((tool) => tool.name);
    expect(queued).toEqual(['submit_translations', 'update_chapter_title']);
  });

  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const contentInStore of [true, false]) {
    for (const writeMode of ['append', 'overwrite'] as const) {
      it(`三批并发提交全部落盘，之后再取块看到的是最新进度（正文${contentInStore ? '已' : '未'}载入、${writeMode}）`, async () => {
        const book = createBook();
        await useBooksStore().addBook(book);
        if (!contentInStore) await useBooksStore().refreshBookFromStorage(book.id);
        const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });

        const results = await Promise.all(
          [0, BATCH_SIZE, BATCH_SIZE * 2].map((start) =>
            kernel.callTool(
              'submit_translations',
              {
                book_id: book.id,
                chapter_id: 'ch-1',
                write_mode: writeMode,
                chapter_title_translation: '第6话',
                paragraphs: batch(start),
              },
              { channel: 'desktop-mcp' },
            ),
          ),
        );

        for (const result of results) {
          expect(result.isError, result.text).toBe(false);
          expect((result.data as { saved_count: number }).saved_count).toBe(BATCH_SIZE);
        }

        // 存储里每段都有译文
        const stored = (await ChapterContentService.loadChapterContent('ch-1')) ?? [];
        const missingInStorage = stored
          .filter((p) => !getLanguageTranslation(p, 'zh-CN')?.translation)
          .map((p) => p.id);
        expect(missingInStorage).toEqual([]);

        // Agent 用来确认的下一次取块读的是书库里的正文：也要看到全部已译
        const chunk = await kernel.callTool(
          'get_translation_chunk',
          { book_id: book.id, chapter_id: 'ch-1' },
          { channel: 'desktop-mcp' },
        );
        expect(chunk.isError, chunk.text).toBe(false);
        const data = chunk.data as { remaining_untranslated_count: number; completed: boolean };
        expect(data.remaining_untranslated_count).toBe(0);
        expect(data.completed).toBe(true);
      });
    }
  }
});
