import './setup';
import { describe, expect, it } from 'bun:test';
import type { Novel, Paragraph } from '../models/novel';
import { SyncDataService } from '../services/sync-data-service';
import {
  appendLanguageTranslation,
  getLanguageTranslation,
  selectLanguageTranslation,
} from '../services/localization/selection';

function book(paragraph: Paragraph, time: number): Novel {
  return {
    id: 'book',
    title: 'Book',
    lastEdited: new Date(time),
    createdAt: new Date(0),
    volumes: [
      {
        id: 'v',
        title: 'V',
        chapters: [
          {
            id: 'c',
            title: 'C',
            lastEdited: new Date(time),
            createdAt: new Date(0),
            content: [paragraph],
          },
        ],
      },
    ],
  };
}

describe('多语言同步选用', () => {
  it('书籍主方较新也不会丢失其他语言选用，明确清空按槽版本传播', async () => {
    const empty: Paragraph = {
      id: 'p',
      text: 'Source',
      translations: [],
      selectedTranslationId: '',
    };
    const cn = appendLanguageTranslation(
      empty,
      'zh-CN',
      { id: 'cn', translation: '中文', aiModelId: 'm' },
      { counter: 1, actorId: 'A' },
      10,
    );
    let en = appendLanguageTranslation(
      empty,
      'en-US',
      { id: 'en', translation: 'English', aiModelId: 'm' },
      { counter: 2, actorId: 'B' },
      20,
    );
    en = selectLanguageTranslation(en, 'zh-CN', null, { counter: 3, actorId: 'B' }, 30);
    const result = await SyncDataService.mergeDataForUpload(
      {
        novels: [book(cn, 3000)],
        aiModels: [],
        coverHistory: [],
        memories: [],
        appSettings: { lastEdited: new Date(0), scraperConcurrencyLimit: 3 },
      },
      { novels: [book(en, 1000)] },
      0,
    );
    const merged = result.novels[0]!.volumes![0]!.chapters![0]!.content![0]!;
    expect(getLanguageTranslation(merged, 'en-US')?.id).toBe('en');
    expect(getLanguageTranslation(merged, 'zh-CN')).toBeUndefined();
    expect(merged.translations.map((t) => t.id).sort()).toEqual(['cn', 'en']);
  });
});

describe('书内实体与标题同步入口', () => {
  it('上传合并保留并发标题语言和别名改名，删除角色阻止离线别名回流', async () => {
    const empty: Paragraph = {
      id: 'p',
      text: 'Source',
      translations: [],
      selectedTranslationId: '',
    };
    const a = book(empty, 3000);
    const b = book(empty, 1000);
    const title = (locale: 'zh-CN' | 'en-US') => ({
      original: 'C',
      translation: { id: '', translation: '', aiModelId: '' },
      translationsByLanguage: {
        [locale]: {
          value: {
            id: locale,
            translation: locale === 'en-US' ? 'Chapter' : '章节',
            aiModelId: 'm',
            language: locale,
          },
          revision: { counter: 1, actorId: locale },
          updatedAt: 0,
        },
      },
    });
    a.volumes![0]!.chapters![0]!.title = title('zh-CN');
    b.volumes![0]!.chapters![0]!.title = title('en-US');
    a.entityTombstones = {
      '["character",null,"c"]': {
        kind: 'character',
        id: 'c',
        revision: { counter: 1, actorId: 'A' },
        deletedAt: 0,
      },
    };
    b.characterSettings = [
      {
        id: 'c',
        name: 'Deleted',
        sex: undefined,
        translation: { id: '', translation: '', aiModelId: '' },
        aliases: [
          { id: 'alias', name: 'Late', translation: { id: '', translation: '', aiModelId: '' } },
        ],
      },
    ];
    const result = await SyncDataService.mergeDataForUpload(
      {
        novels: [a],
        aiModels: [],
        coverHistory: [],
        memories: [],
        appSettings: { lastEdited: new Date(0), scraperConcurrencyLimit: 3 },
      },
      { novels: [b] },
      0,
    );
    const merged = result.novels[0]!;
    expect(merged.characterSettings).toEqual([]);
    const mergedTitle = merged.volumes![0]!.chapters![0]!.title;
    expect(typeof mergedTitle).toBe('object');
    if (typeof mergedTitle !== 'string') {
      expect(mergedTitle.translationsByLanguage?.['en-US']?.value?.translation).toBe('Chapter');
      expect(mergedTitle.translationsByLanguage?.['zh-CN']?.value?.translation).toBe('章节');
    }
  });
});
