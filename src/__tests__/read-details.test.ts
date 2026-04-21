import './setup';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { appendReadDetails } from 'src/utils/action-info/read-details';
import type { ActionDetail, ActionDetailsContext } from 'src/utils/action-info/types';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { Novel, Paragraph, Chapter } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';

function makeAction(over: Partial<MessageAction>): MessageAction {
  return {
    type: 'read',
    entity: 'chapter',
    timestamp: 0,
    ...over,
  } as MessageAction;
}

function makeNovel(over: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: '测试书',
    createdAt: new Date(),
    lastEdited: new Date(),
    ...over,
  };
}

function makeChapter(title = '第一章'): Chapter {
  return {
    id: 'c1',
    title,
    createdAt: new Date(),
    lastEdited: new Date(),
  };
}

function makeContext(over: Partial<ActionDetailsContext> = {}): ActionDetailsContext {
  return {
    getBookById: () => undefined,
    getCurrentBookId: () => null,
    ...over,
  };
}

describe('appendReadDetails', () => {
  afterEach(() => {
    mock.restore();
  });

  describe('顶层行为', () => {
    it('有 tool_name 时总是首先追加「工具」', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(details, makeAction({ tool_name: 'unknown_tool' }), makeContext());
      expect(details[0]).toEqual({ label: '工具', value: 'unknown_tool' });
    });

    it('没有 tool_name 时不追加工具字段', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(details, makeAction({}), makeContext());
      expect(details.some((d) => d.label === '工具')).toBe(false);
    });

    it('默认分支：无匹配 handler 时透传 keywords / regex_pattern / chapter_id', () => {
      const details: ActionDetail[] = [];
      const book = makeNovel({ volumes: [{ id: 'v1', title: 'V1', chapters: [makeChapter()] }] });
      appendReadDetails(
        details,
        makeAction({
          tool_name: 'some_unknown_tool',
          keywords: ['K1', 'K2'],
          regex_pattern: '/x/',
          chapter_id: 'c1',
        }),
        makeContext({
          getCurrentBookId: () => 'b1',
          getBookById: () => book,
        }),
      );
      expect(details).toContainEqual({ label: '关键词', value: 'K1、K2' });
      expect(details).toContainEqual({ label: '正则表达式', value: '/x/' });
      expect(details).toContainEqual({ label: '章节', value: '第一章' });
    });
  });

  describe('READ_TOOL_HANDLERS 覆盖', () => {
    it('get_help_doc + title 输出文档标题', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_help_doc', title: '文档 A' }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '文档标题', value: '文档 A' });
    });

    it('list_help_docs 总是输出「已获取」', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(details, makeAction({ tool_name: 'list_help_docs' }), makeContext());
      expect(details).toContainEqual({ label: '文档列表', value: '已获取' });
    });

    it('get_book_info + book_id 输出书籍基本信息（含 author 和截断的 description）', () => {
      const details: ActionDetail[] = [];
      const longDesc = 'd'.repeat(150);
      const book = makeNovel({ author: '作者', description: longDesc });
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_book_info', book_id: 'b1' }),
        makeContext({ getBookById: () => book }),
      );
      expect(details).toContainEqual({ label: '书籍', value: '测试书' });
      expect(details).toContainEqual({ label: '作者', value: '作者' });
      const desc = details.find((d) => d.label === '简介');
      expect(desc).toBeTruthy();
      expect(desc!.value.endsWith('...')).toBe(true);
      expect(desc!.value.length).toBe(103);
    });

    it('get_book_info 找不到书籍时不输出书籍字段', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_book_info', book_id: 'nope' }),
        makeContext({ getBookById: () => undefined }),
      );
      expect(details.some((d) => d.label === '书籍')).toBe(false);
    });

    it('get_memory + memory_id 输出 Memory ID', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_memory', memory_id: 'mem1' }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: 'Memory ID', value: 'mem1' });
    });

    it('search_characters_by_keywords 输出搜索关键词', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'search_characters_by_keywords', keywords: ['k1'] }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '搜索关键词', value: 'k1' });
    });

    it('search_terms_by_keywords 输出搜索关键词', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'search_terms_by_keywords', keywords: ['a', 'b'] }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '搜索关键词', value: 'a、b' });
    });

    it('find_paragraph_by_keywords 同时输出原文关键词、翻译关键词和章节', () => {
      const details: ActionDetail[] = [];
      const book = makeNovel({ volumes: [{ id: 'v1', title: 'V', chapters: [makeChapter('第一章')] }] });
      appendReadDetails(
        details,
        makeAction({
          tool_name: 'find_paragraph_by_keywords',
          keywords: ['k1'],
          translation_keywords: ['t1'],
          chapter_id: 'c1',
        }),
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => book }),
      );
      expect(details).toContainEqual({ label: '原文关键词', value: 'k1' });
      expect(details).toContainEqual({ label: '翻译关键词', value: 't1' });
      expect(details).toContainEqual({ label: '章节', value: '第一章' });
    });

    it('search_paragraphs_by_regex 输出正则 + 章节', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'search_paragraphs_by_regex', regex_pattern: '/x/' }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '正则表达式', value: '/x/' });
    });

    it('get_occurrences_by_keywords 输出关键词', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_occurrences_by_keywords', keywords: ['k'] }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '关键词', value: 'k' });
    });
  });

  describe('appendCommonReadFields 覆盖', () => {
    it('写入 chapter_title / character_name / name', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({
          tool_name: 'get_help_doc',
          chapter_title: '第二章',
          character_name: '主角',
          name: '某名',
        }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '章节标题', value: '第二章' });
      expect(details).toContainEqual({ label: '角色名称', value: '主角' });
      expect(details).toContainEqual({ label: '名称', value: '某名' });
    });

    it('paragraph_id 存在时输出段落 ID，并在匹配段落工具名时尝试解析原文预览', () => {
      const paragraph: Paragraph = {
        id: 'p1',
        text: '这是一段较长的原文，用于测试预览截断逻辑的效果。'.repeat(3),
        selectedTranslationId: '',
        translations: [],
      };
      const chapter = makeChapter('第一章');
      const book = makeNovel({ volumes: [{ id: 'v1', title: 'V', chapters: [chapter] }] });

      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue({
        paragraph,
        paragraphIndex: 0,
        chapter,
        chapterIndex: 0,
        volume: { id: 'v1', title: 'V' },
        volumeIndex: 0,
      } as ReturnType<typeof ChapterService.findParagraphLocation>);

      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_paragraph_info', paragraph_id: 'p1' }),
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => book }),
      );
      expect(details).toContainEqual({ label: '段落 ID', value: 'p1' });
      expect(details).toContainEqual({ label: '章节', value: '第一章' });
      const preview = details.find((d) => d.label === '原文预览');
      expect(preview).toBeTruthy();
      expect(preview!.value.endsWith('...')).toBe(true);
    });

    it('paragraph_id 存在但非段落查询工具时只输出段落 ID', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_memory', paragraph_id: 'pX', memory_id: 'm' }),
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details).toContainEqual({ label: '段落 ID', value: 'pX' });
      expect(details.some((d) => d.label === '章节')).toBe(false);
      expect(details.some((d) => d.label === '原文预览')).toBe(false);
    });

    it('段落查询 + 当前书籍 ID 缺失时提前返回，不输出预览', () => {
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_paragraph_info', paragraph_id: 'p1' }),
        makeContext({ getCurrentBookId: () => null }),
      );
      expect(details).toContainEqual({ label: '段落 ID', value: 'p1' });
      expect(details.some((d) => d.label === '原文预览')).toBe(false);
    });

    it('段落查询 + 找不到段落时不输出章节/预览', () => {
      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue(null);
      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_next_paragraphs', paragraph_id: 'pX' }),
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details.some((d) => d.label === '原文预览')).toBe(false);
    });

    it('已存在「章节」字段时不会重复添加', () => {
      const paragraph: Paragraph = {
        id: 'p1',
        text: '短文本',
        selectedTranslationId: '',
        translations: [],
      };
      const chapter = makeChapter('第三章');
      const book = makeNovel({ volumes: [{ id: 'v1', title: 'V', chapters: [chapter] }] });

      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue({
        paragraph,
        paragraphIndex: 0,
        chapter,
        chapterIndex: 0,
        volume: { id: 'v1', title: 'V' },
        volumeIndex: 0,
      } as ReturnType<typeof ChapterService.findParagraphLocation>);

      const details: ActionDetail[] = [
        { label: '章节', value: '已有章节' },
      ];
      appendReadDetails(
        details,
        makeAction({
          tool_name: 'get_previous_paragraphs',
          paragraph_id: 'p1',
        }),
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => book }),
      );
      // 预览仍会加，但「章节」只应出现一次且仍是原值
      const chapterRows = details.filter((d) => d.label === '章节');
      expect(chapterRows).toHaveLength(1);
      expect(chapterRows[0]?.value).toBe('已有章节');
    });

    it('段落 text 为空时不输出原文预览', () => {
      const paragraph: Paragraph = {
        id: 'p1',
        text: '',
        selectedTranslationId: '',
        translations: [],
      };
      const chapter = makeChapter('Ch');
      const book = makeNovel({ volumes: [{ id: 'v1', title: 'V', chapters: [chapter] }] });

      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue({
        paragraph,
        paragraphIndex: 0,
        chapter,
        chapterIndex: 0,
        volume: { id: 'v1', title: 'V' },
        volumeIndex: 0,
      } as ReturnType<typeof ChapterService.findParagraphLocation>);

      const details: ActionDetail[] = [];
      appendReadDetails(
        details,
        makeAction({ tool_name: 'get_paragraph_info', paragraph_id: 'p1' }),
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => book }),
      );
      expect(details.some((d) => d.label === '原文预览')).toBe(false);
    });
  });
});
