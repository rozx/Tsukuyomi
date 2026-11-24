/**
 * 在开发服务器的页面里运行（由 capture.ts 通过 `import('/scripts/screenshots/seed-in-page.ts')` 加载），
 * 用应用自己的 store / service 写入演示书库，保证数据形状和正常使用时一致。
 */
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useTaskQueueStore } from 'src/stores/task-queue';
import { getDB } from 'src/utils/indexed-db';
import { BookService } from 'src/services/book-service';
import { MemoryService } from 'src/services/memory-service';
import { generateShortId } from 'src/utils/id-generator';
import type { AppLocale } from 'src/models/locale';
import type { Chapter, CharacterSetting, Novel, Terminology, Volume } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ChatSession } from 'src/stores/chat-sessions';
import type { ParagraphTranslationEdit } from 'src/services/localization/paragraph-edit';
import type { TaskQueueItem } from 'src/models/task-queue';
import type { AozoraVolume } from './aozora';
import { drawDemoCover } from './demo-covers';
import {
  DEMO_BOOKS,
  DEMO_CHARACTERS,
  DEMO_CHAT,
  DEMO_DEFAULT_VOLUME_TITLE,
  DEMO_DEFAULT_VOLUME_TRANSLATION,
  DEMO_MAIN_BOOK_KEY,
  DEMO_MAIN_CHAPTER_TITLES,
  DEMO_MEMORIES,
  DEMO_MODELS,
  DEMO_TERMS,
} from './demo-library';
import { DEMO_ALTERNATE_TRANSLATIONS, DEMO_TRANSLATIONS } from './demo-translations';

export interface DemoSeedPayload {
  locale: AppLocale;
  /** 以 DemoBook.key 为键的青空文库正文 */
  works: Record<string, AozoraVolume[]>;
}

export interface DemoSeedResult {
  bookIds: Record<string, string>;
  mainBookId: string;
  mainChapterIds: string[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function createIdFactory(): () => string {
  const used = new Set<string>();
  return () => {
    let id = generateShortId();
    while (used.has(id)) id = generateShortId();
    used.add(id);
    return id;
  };
}

async function seedModels(): Promise<AIModel[]> {
  const store = useAIModelsStore();
  const settings = useSettingsStore();
  const models: AIModel[] = [];
  for (const [index, demo] of DEMO_MODELS.entries()) {
    const task = (name: (typeof demo.defaults)[number]) => ({
      enabled: demo.defaults.includes(name),
      temperature: 0.7,
    });
    const model: AIModel = {
      id: crypto.randomUUID(),
      name: demo.name,
      provider: demo.provider,
      model: demo.model,
      temperature: 0.7,
      maxInputTokens: demo.maxInputTokens,
      maxOutputTokens: demo.maxOutputTokens,
      limitsSource: 'catalog',
      apiKey: 'demo-key-not-a-real-credential',
      baseUrl: demo.baseUrl,
      isDefault: {
        translation: task('translation'),
        proofreading: task('proofreading'),
        termsTranslation: task('termsTranslation'),
        assistant: task('assistant'),
      },
      enabled: true,
      lastEdited: new Date(Date.now() - (index + 1) * DAY),
    };
    await store.addModel(model);
    for (const name of demo.defaults) await settings.setTaskDefaultModelId(name, model.id);
    models.push(model);
  }
  return models;
}

function buildBook(
  demo: (typeof DEMO_BOOKS)[number],
  work: AozoraVolume[],
  locale: AppLocale,
  cover: string,
  nextId: () => string,
): Novel {
  const now = Date.now();
  const createdAt = new Date(now - demo.createdDaysAgo * DAY);
  const lastEdited = new Date(now - demo.editedHoursAgo * HOUR);
  const volumes: Volume[] = work.map((volume) => ({
    id: nextId(),
    title: volume.title ?? DEMO_DEFAULT_VOLUME_TITLE,
    chapters: volume.chapters.map(
      (chapter): Chapter => ({
        id: nextId(),
        title: chapter.title,
        content: chapter.paragraphs.map((text) => ({
          id: nextId(),
          text,
          selectedTranslationId: '',
          translations: [],
        })),
        contentLoaded: true,
        createdAt,
        lastEdited: createdAt,
      }),
    ),
  }));
  return {
    id: crypto.randomUUID(),
    targetLanguage: locale,
    title: demo.title[locale],
    alternateTitles: [demo.originalTitle],
    author: demo.author[locale],
    description: demo.description[locale],
    tags: demo.tags[locale],
    cover: { url: cover },
    webUrl: [`https://www.aozora.gr.jp/cards/${demo.aozoraPath}`],
    starred: demo.starred === true,
    volumes,
    createdAt,
    lastEdited,
  };
}

async function translateMainBook(
  book: Novel,
  locale: AppLocale,
  models: AIModel[],
  nextId: () => string,
): Promise<void> {
  const [primary, secondary] = models;
  if (!primary || !secondary) throw new Error('演示模型不足');
  const chapters = book.volumes?.flatMap((volume) => volume.chapters ?? []) ?? [];

  for (const volume of book.volumes ?? []) {
    if (volume.title !== DEMO_DEFAULT_VOLUME_TITLE) continue;
    await BookService.editTitle(book.id, locale, {
      kind: 'volume',
      id: volume.id,
      expectedOriginal: DEMO_DEFAULT_VOLUME_TITLE,
      translation: DEMO_DEFAULT_VOLUME_TRANSLATION[locale],
      aiModelId: primary.id,
    });
  }
  for (const [index, chapter] of chapters.entries()) {
    const translation = DEMO_MAIN_CHAPTER_TITLES[locale][index];
    if (!translation || typeof chapter.title !== 'string') continue;
    await BookService.editTitle(book.id, locale, {
      kind: 'chapter',
      id: chapter.id,
      expectedOriginal: chapter.title,
      translation,
      aiModelId: primary.id,
    });
  }

  for (const [chapterIndex, texts] of DEMO_TRANSLATIONS[locale].entries()) {
    const chapter = chapters[chapterIndex];
    if (!chapter?.content) throw new Error(`演示译文找不到第 ${chapterIndex + 1} 章`);
    if (chapter.content.length !== texts.length) {
      throw new Error(
        `第 ${chapterIndex + 1} 章段落数（${chapter.content.length}）与演示译文（${texts.length}）不一致`,
      );
    }
    const append = (index: number, translation: string, model: AIModel, selectNew: boolean) => {
      const paragraph = chapter.content![index]!;
      return {
        type: 'append',
        paragraphId: paragraph.id,
        originalText: paragraph.text,
        translation: { id: nextId(), translation, aiModelId: model.id, language: locale },
        selectNew,
      } satisfies ParagraphTranslationEdit;
    };
    await BookService.editParagraphTranslations(
      book.id,
      chapter.id,
      locale,
      texts.map((text, index) => append(index, text, primary, true)),
    );
    // 另一个模型的版本单独提交：同一次编辑里对同一段落只能写入一次选用状态
    const alternates = chapterIndex === 0 ? DEMO_ALTERNATE_TRANSLATIONS[locale] : {};
    const extra = Object.entries(alternates).map(([index, text]) =>
      append(Number(index), text, secondary, false),
    );
    if (extra.length > 0) {
      await BookService.editParagraphTranslations(book.id, chapter.id, locale, extra);
    }
  }
}

async function seedMainBookEntities(
  bookId: string,
  locale: AppLocale,
  model: AIModel,
  nextId: () => string,
): Promise<void> {
  const base = await BookService.getBookById(bookId);
  if (!base) throw new Error('演示主书保存后读不到');
  const translate = (text: string) => ({
    id: nextId(),
    translation: text,
    aiModelId: model.id,
    language: locale,
  });
  const terminologies: Terminology[] = DEMO_TERMS.map((term) => ({
    id: nextId(),
    name: term.name,
    description: term.description[locale],
    translation: translate(term.translation[locale]),
  }));
  const characterSettings: CharacterSetting[] = DEMO_CHARACTERS.map((character) => ({
    id: nextId(),
    name: character.name,
    sex: character.sex,
    description: character.description[locale],
    speakingStyle: character.speakingStyle[locale],
    translation: translate(character.translation[locale]),
    aliases: character.aliases.map((alias) => ({
      id: crypto.randomUUID(),
      name: alias.name,
      translation: translate(alias.translation[locale]),
    })),
  }));
  await BookService.editEntities(base, { terminologies, characterSettings }, locale);
  for (const memory of DEMO_MEMORIES[locale]) {
    await MemoryService.createMemory(bookId, memory.content, memory.summary);
  }
}

function seedChatSession(bookId: string, chapterId: string, locale: AppLocale): void {
  const chat = DEMO_CHAT[locale];
  const startedAt = Date.now() - 12 * 60_000;
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: chat.title,
    messages: chat.messages.map((message, index) => ({
      id: crypto.randomUUID(),
      role: message.role,
      content: message.content,
      timestamp: startedAt + index * 90_000,
    })),
    context: { bookId, chapterId, paragraphId: null },
    createdAt: startedAt,
    updatedAt: startedAt + chat.messages.length * 90_000,
    lastSummarizedMessageIndex: 0,
  };
  localStorage.setItem('tsukuyomi-chat-sessions', JSON.stringify([session]));
  localStorage.setItem('tsukuyomi-chat-current-session-id', session.id);
}

/**
 * 任务中心：前两章是已完成的翻译，后面四章在暂停的队列里排队。
 * 队列保持暂停，所以不会真的向模型发请求。
 */
async function seedTaskQueue(book: Novel, locale: AppLocale): Promise<void> {
  const chapters = book.volumes?.flatMap((volume) => volume.chapters ?? []) ?? [];
  const queue = useTaskQueueStore();
  await queue.ensureStarted();
  await queue.pause();
  await queue.enqueue(
    chapters.slice(2, 6).map((chapter) => ({
      bookId: book.id,
      chapterId: chapter.id,
      kind: 'translation' as const,
      mode: 'continue' as const,
      origin: 'batch' as const,
    })),
    { position: 'back' },
  );
  const db = await getDB();
  const now = Date.now();
  for (const [index, chapter] of chapters.slice(0, 2).entries()) {
    const endedAt = now - (25 - index * 9) * 60_000;
    const done: TaskQueueItem = {
      id: crypto.randomUUID(),
      bookId: book.id,
      chapterId: chapter.id,
      kind: 'translation',
      mode: 'continue',
      origin: 'batch',
      status: 'done',
      order: -10 + index,
      targetLanguage: locale,
      completedParagraphIds: chapter.content?.map((paragraph) => paragraph.id) ?? [],
      aiTaskIds: [],
      enqueuedAt: endedAt - 5 * 60_000,
      startedAt: endedAt - 4 * 60_000,
      endedAt,
    };
    await db.put('task-queue', done);
  }
}

/** 进入书籍详情时直接停在第一章，目录展开 */
async function openFirstChapter(book: Novel): Promise<void> {
  const details = useBookDetailsStore();
  const volume = book.volumes?.[0];
  const chapter = volume?.chapters?.[0];
  if (!volume || !chapter) return;
  if (!details.isVolumeExpanded(book.id, volume.id)) details.toggleVolume(book.id, volume.id);
  details.setSelectedChapter(book.id, chapter.id);
  // 界面状态是异步落盘的，留出时间再让截图脚本刷新页面
  await new Promise((done) => setTimeout(done, 500));
}

export async function seedDemoLibrary(payload: DemoSeedPayload): Promise<DemoSeedResult> {
  const { locale, works } = payload;
  const settings = useSettingsStore();
  await settings.setUiLocale(locale);
  await settings.setQuickStartDismissed(true);

  const models = await seedModels();
  const books = useBooksStore();
  const nextId = createIdFactory();
  const bookIds: Record<string, string> = {};
  let main: Novel | undefined;

  for (const demo of DEMO_BOOKS) {
    const work = works[demo.key];
    if (!work) throw new Error(`缺少演示作品正文：${demo.key}`);
    const cover = await drawDemoCover(demo);
    const book = buildBook(demo, work, locale, cover, nextId);
    await books.addBook(book);
    bookIds[demo.key] = book.id;
    if (demo.key === DEMO_MAIN_BOOK_KEY) main = book;
  }
  if (!main) throw new Error('演示书库缺少主书');

  await translateMainBook(main, locale, models, nextId);
  await seedMainBookEntities(main.id, locale, models[0]!, nextId);
  const mainChapterIds = main.volumes?.flatMap((v) => v.chapters ?? []).map((c) => c.id) ?? [];
  seedChatSession(main.id, mainChapterIds[0]!, locale);
  await seedTaskQueue(main, locale);
  await openFirstChapter(main);

  return { bookIds, mainBookId: main.id, mainChapterIds };
}
