import { afterEach, describe, expect, it } from 'bun:test';
import { createApp, computed, ref } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ToastService from 'primevue/toastservice';
import './setup';
import type { Chapter, Novel, Paragraph } from '../models/novel';
import { ChapterService } from '../services/chapter-service';
import { normalizeParagraphLanguages } from '../services/localization/normalize';
import { useEditMode } from '../composables/book-details/useEditMode';
import { useBooksStore } from '../stores/books';
import { ChapterContentService } from '../services/chapter-content-service';

let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
});

function paragraph(id: string): Paragraph {
  return normalizeParagraphLanguages({
    id,
    text: `原文${id}`,
    translations: [
      { id: `${id}-cn`, translation: '简中', language: 'zh-CN', aiModelId: '' },
      { id: `${id}-en`, translation: 'English', language: 'en-US', aiModelId: '' },
    ],
    selectedTranslationId: `${id}-cn`,
    selectedTranslations: {
      'zh-CN': { value: `${id}-cn`, revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
      'en-US': { value: `${id}-en`, revision: { counter: 1, actorId: 'a' }, updatedAt: 1 },
    },
  });
}

const chapter = (id: string, content: Paragraph[]): Chapter => ({
  id,
  title: { original: id, translation: { id: '', translation: '', aiModelId: '' } },
  content,
  createdAt: new Date(0),
  lastEdited: new Date(0),
});

function book(content: Paragraph[]): Novel {
  return {
    id: 'book',
    title: '书',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    volumes: [
      {
        id: 'v1',
        title: '一',
        chapters: [chapter('c1', content), chapter('c2', [paragraph('outside')])],
      },
      { id: 'v2', title: '二', chapters: [] },
    ],
  };
}

describe('多语言原文编辑', () => {
  it('标题原文不变保留所有语言，改原文后清空旧标题译文', () => {
    const original = book([paragraph('p1')]);
    const title = {
      original: '原始章名',
      translation: { id: 'cn', translation: '简中章名', aiModelId: '' },
      translationsByLanguage: {
        'en-US': {
          value: {
            id: 'en',
            translation: 'English title',
            language: 'en-US' as const,
            aiModelId: '',
          },
          revision: { counter: 1, actorId: 'a' },
          updatedAt: 1,
        },
      },
    };
    original.volumes![0]!.chapters![0]!.title = title;
    original.volumes![0]!.title = title;
    const same = ChapterService.updateChapter(original, 'c1', { title: '原始章名' });
    expect(same[0]?.chapters?.[0]?.title).toEqual(title);
    const changed = ChapterService.updateChapter(original, 'c1', { title: '新的原始章名' });
    expect(changed[0]?.chapters?.[0]?.title).toMatchObject({
      original: '新的原始章名',
      translationsByLanguage: {},
      translation: { translation: '' },
    });
    expect(ChapterService.updateVolume(original, 'v1', { title: '原始章名' })[0]?.title).toEqual(
      title,
    );
    expect(
      ChapterService.updateVolume(original, 'v1', { title: '新的卷名' })[0]?.title,
    ).toMatchObject({
      original: '新的卷名',
      translationsByLanguage: {},
      translation: { translation: '' },
    });
  });
  it('普通原文编辑插入一行后，后续未变段落保留多语言版本与身份', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const books = useBooksStore();
    const initial = book([paragraph('p1'), paragraph('p2')]);
    await books.addBook(initial);
    const loaded = ref(initial.volumes![0]!.chapters![0]!);
    let editor: ReturnType<typeof useEditMode> | undefined;
    app = createApp({
      setup() {
        editor = useEditMode(
          computed(() => books.getBookById('book')),
          loaded,
          computed(() => loaded.value.content ?? []),
          ref('c1'),
          () => {},
        );
        return () => null;
      },
    });
    app.use(pinia).use(ToastService).mount(document.createElement('div'));
    editor!.startEditingOriginalText();
    editor!.originalTextEditValue.value = '原文p1\n新增一行\n原文p2';
    await editor!.saveOriginalTextEdit();
    const saved = await ChapterContentService.loadChapterContent('c1');
    expect(saved?.[2]).toEqual(paragraph('p2'));
    expect(saved?.[0]).toEqual(paragraph('p1'));
    expect(saved?.[1]?.translations).toEqual([]);
  });
  it('批量更新懒加载正文时清空修订段落的全部语言', () => {
    const original = book([paragraph('p1'), paragraph('p2')]);
    const loaded = original.volumes![0]!.chapters![0]!;
    const volumes = original.volumes!.map((volume) => ({
      ...volume,
      chapters: volume.chapters?.map((value) => ({ ...value, content: undefined })),
    }));
    const result = ChapterService.updateChapterContentInVolumes(volumes, 'c1', loaded, (content) =>
      content.map((value) => (value.id === 'p1' ? { ...value, text: '修订' } : value)),
    );
    expect(result[0]?.chapters?.[0]?.content?.[0]).toMatchObject({
      translations: [],
      selectedTranslationId: '',
      selectedTranslations: {},
    });
    expect(result[0]?.chapters?.[0]?.content?.[1]).toEqual(loaded.content?.[1]);
  });

  it('跨卷移动和章节删除不修改其他章节的多语言数据', () => {
    const original = book([paragraph('p1')]);
    const moved = ChapterService.moveChapter(original, 'c1', 'v2');
    expect(moved[1]?.chapters?.[0]).toEqual(original.volumes?.[0]?.chapters?.[0]);
    const removed = ChapterService.deleteChapter({ ...original, volumes: moved }, 'c1');
    expect(removed[1]?.chapters).toEqual([]);
    expect(removed[0]?.chapters).toEqual([original.volumes![0]!.chapters![1]!]);
  });
  it('合并和替换章节都不能保存修订原文的旧语言版本', () => {
    const original = chapter('c1', [paragraph('p1'), paragraph('p2')]);
    original.webUrl = 'https://example.com/1';
    const incoming = {
      ...original,
      content: [{ ...original.content![0]!, text: '新原文' }, original.content![1]!],
    };
    for (const strategy of ['merge', 'replace'] as const) {
      const result = ChapterService.mergeChapters([original], [incoming], strategy)[0]!;
      expect(result.content?.[0]).toMatchObject({
        translations: [],
        selectedTranslationId: '',
        selectedTranslations: {},
      });
      expect(result.content?.[1]).toEqual(original.content?.[1]);
    }
  });
  it('同 ID 原文修订清空所有语言，换序与范围外内容保留', () => {
    const first = paragraph('p1');
    const second = paragraph('p2');
    const original = book([first, second]);
    const volumes = ChapterService.updateChapter(original, 'c1', {
      content: [second, { ...first, text: '修订后的原文' }],
    });
    expect(volumes[0]?.chapters?.[0]?.content?.[1]).toMatchObject({
      id: 'p1',
      text: '修订后的原文',
      translations: [],
      selectedTranslationId: '',
      selectedTranslations: {},
    });
    expect(volumes[0]?.chapters?.[0]?.content?.[0]).toEqual(second);
    expect(volumes[0]?.chapters?.[1]).toEqual(original.volumes?.[0]?.chapters?.[1]);
    expect(original.volumes?.[0]?.chapters?.[0]?.content?.[0]).toEqual(first);
  });
});
