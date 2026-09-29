import './setup';
import { afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getDB } from '../utils/indexed-db';
import { useBooksStore } from '../stores/books';
import { useSettingsStore } from '../stores/settings';
import { SyncDataService } from '../services/sync-data-service';
import { normalizeBookLanguages } from '../services/localization/normalize';
import type { Novel, Paragraph, Terminology } from '../models/novel';

afterEach(() => vi.restoreAllMocks());
it('整份设置导入后续失败时还原书籍身份、全部语言、界面偏好和记忆向量', async () => {
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  await settings.loadSettings();
  await settings.setUiLocale('en-US');
  const books = useBooksStore();
  const original: Novel = normalizeBookLanguages({
    id: 'b',
    title: 'Original',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    characterSettings: [
      {
        id: 'c',
        name: 'Alice',
        sex: undefined,
        translation: { id: 'cn', translation: '爱丽丝', aiModelId: 'm' },
        aliases: [],
      },
    ],
  });
  await books.addBook(original);
  const db = await getDB();
  const memory = {
    id: 'mem',
    bookId: 'b',
    content: 'original',
    summary: '',
    createdAt: 1,
    lastAccessedAt: 2,
    embeddings: [[1, 2]],
    embeddingModel: 'local',
  };
  await db.put('memories', memory);
  const imported = {
    novels: [{ ...original, title: 'Restored' }],
    memories: [],
    appSettings: { ...settings.settings, uiLocale: 'zh-TW' as const },
  };
  const fail = vi.spyOn(settings, 'importSettings').mockRejectedValueOnce(new Error('quota'));
  await expect(
    SyncDataService.importSettingsSnapshot(imported, 'settings-restore'),
  ).rejects.toThrow('quota');
  fail.mockRestore();
  expect((await db.get('books', 'b'))!.characterSettings![0]!.id).toBe('c');
  expect((await db.get('books', 'b'))!.title).toBe('Original');
  expect(settings.uiLocale).toBe('en-US');
  expect(await db.get('memories', 'mem')).toEqual(memory);
  await SyncDataService.importSettingsSnapshot(imported, 'settings-restore');
  expect((await db.get('books', 'b'))!.title).toBe('Restored');
});

it('记忆清空失败必须触发整体回滚，不能报告成功导入', async () => {
  const { MemoryService } = await import('../services/memory-service');
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  await settings.loadSettings();
  const books = useBooksStore();
  await books.addBook({
    id: 'keep',
    title: 'Keep',
    createdAt: new Date(0),
    lastEdited: new Date(0),
  });
  vi.spyOn(MemoryService, 'clearAllMemories').mockRejectedValueOnce(new Error('memory quota'));
  await expect(
    SyncDataService.importSettingsSnapshot({ novels: [], memories: [] }, 'memory-fail'),
  ).rejects.toThrow('memory quota');
  await expect((await getDB()).get('books', 'keep')).resolves.toBeDefined();
});

it('三语言书籍通过设置 JSON 解析和覆盖导入往返，分配记录不进入导出数据', async () => {
  const { SettingsService } = await import('../services/settings-service');
  const { APP_LOCALES } = await import('../models/locale');
  const { appendLanguageTranslation, setNameTranslation } =
    await import('../services/localization/selection');
  setActivePinia(createPinia());
  const settings = useSettingsStore();
  await settings.loadSettings();
  let paragraph = {
    id: 'p',
    text: 'Source',
    selectedTranslationId: '',
    translations: [],
  } as Paragraph;
  let term = {
    id: 't',
    name: 'Term',
    translation: { id: 'cn', translation: '', aiModelId: '' },
  } as Terminology;
  for (const [i, locale] of APP_LOCALES.entries()) {
    paragraph = appendLanguageTranslation(
      paragraph,
      locale,
      { id: locale, translation: locale, aiModelId: 'm' },
      { counter: i + 1, actorId: 'old-device' },
      0,
    );
    term = setNameTranslation(
      term,
      locale,
      { id: `name-${locale}`, translation: locale, aiModelId: 'm' },
      { counter: i + 1, actorId: 'old-device' },
      0,
    );
  }
  const book: Novel = normalizeBookLanguages({
    id: 'roundtrip',
    title: 'Book',
    targetLanguage: 'en-US',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    terminologies: [term],
    volumes: [
      {
        id: 'v',
        title: 'V',
        chapters: [
          {
            id: 'c',
            title: 'C',
            createdAt: new Date(0),
            lastEdited: new Date(0),
            content: [paragraph],
          },
        ],
      },
    ],
  });
  const raw = JSON.parse(
    JSON.stringify({
      novels: [book],
      aiModels: [],
      coverHistory: [],
      appSettings: settings.settings,
    }),
  );
  const parsed = SettingsService.validateAndParseSettings(raw);
  expect(parsed.success).toBe(true);
  if (!parsed.data) throw new Error('missing parsed data');
  await SyncDataService.importSettingsSnapshot(parsed.data, 'roundtrip-import');
  const db = await getDB();
  const saved = (await db.get('books', 'roundtrip'))!;
  const content = JSON.parse((await db.get('chapter-contents', 'c'))!.content);
  expect(saved.targetLanguage).toBe('en-US');
  for (const locale of APP_LOCALES) {
    expect(saved.terminologies![0]!.translationsByLanguage![locale]!.value!.translation).toBe(
      locale,
    );
    expect(content[0].selectedTranslations[locale].value).toBe(locale);
  }
  expect(raw['sync-metadata']).toBeUndefined();
  expect(raw['entity-operations']).toBeUndefined();
});
