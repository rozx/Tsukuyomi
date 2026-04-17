import { describe, expect, it } from 'bun:test';
import './setup';

import { hashJson } from '../utils/content-hash';
import {
  normalizeMemoriesForSync,
  sortAIModelsById,
  sortCoversById,
  stripNovelLocalFields,
} from '../utils/sync-strip';
import type { Memory } from '../models/memory';
import type { CoverHistoryItem, Novel, Paragraph, Translation } from '../models/novel';
import type { AIModel } from '../services/ai/types/ai-model';

// 这些测试捕获的是 "outdated → latest, no local changes" 场景下的关键不变式：
// 设备 A 规范化后的哈希，应该等于设备 B 在以任意本地顺序/键序持有完全相同逻辑数据时
// 规范化后的哈希。这是 useSyncExecutor 基于哈希决策"是否需要上传"的基础。

describe('hash stability across device-local ordering differences', () => {
  describe('ai-models aggregate', () => {
    const makeModel = (id: string, name: string): AIModel =>
      ({
        id,
        name,
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.5,
        maxInputTokens: 0,
        maxOutputTokens: 0,
        apiKey: '',
        baseUrl: '',
        isDefault: {
          translation: { enabled: false, temperature: 0.5 },
          proofreading: { enabled: false, temperature: 0.5 },
          termsTranslation: { enabled: false, temperature: 0.5 },
          assistant: { enabled: false, temperature: 0.5 },
        },
        enabled: true,
        lastEdited: new Date('2026-01-01T00:00:00Z'),
      }) as AIModel;

    it('hashes identically regardless of local array order', async () => {
      const deviceAOrder = [makeModel('a', 'A'), makeModel('b', 'B'), makeModel('c', 'C')];
      const deviceBOrder = [makeModel('c', 'C'), makeModel('a', 'A'), makeModel('b', 'B')];

      const hashA = await hashJson(sortAIModelsById(deviceAOrder));
      const hashB = await hashJson(sortAIModelsById(deviceBOrder));
      expect(hashA).toBe(hashB);
    });
  });

  describe('cover-history aggregate', () => {
    const makeCover = (id: string, url: string): CoverHistoryItem => ({
      id,
      url,
      addedAt: new Date('2026-01-01T00:00:00Z'),
    });

    it('hashes identically regardless of local array order', async () => {
      const deviceAOrder = [
        makeCover('x', 'u1'),
        makeCover('y', 'u2'),
        makeCover('z', 'u3'),
      ];
      const deviceBOrder = [
        makeCover('z', 'u3'),
        makeCover('y', 'u2'),
        makeCover('x', 'u1'),
      ];

      const hashA = await hashJson(sortCoversById(deviceAOrder));
      const hashB = await hashJson(sortCoversById(deviceBOrder));
      expect(hashA).toBe(hashB);
    });
  });

  describe('memories aggregate', () => {
    const makeMemory = (id: string, content: string, lastAccessedAt: number): Memory => ({
      id,
      bookId: 'book-1',
      content,
      summary: `summary-${id}`,
      createdAt: 1000,
      lastAccessedAt,
    });

    it('hashes identically regardless of local order and embedding presence', async () => {
      // 设备 A: 已生成 embedding（应在同步前被剥离）
      const deviceA: Record<string, Memory[]> = {
        'book-1': [
          { ...makeMemory('m1', 'A', 2000), embedding: [0.1, 0.2], embeddingModel: 'gemma' },
          makeMemory('m2', 'B', 1500),
        ],
      };
      // 设备 B: 尚未生成 embedding、数组顺序不同
      const deviceB: Record<string, Memory[]> = {
        'book-1': [makeMemory('m2', 'B', 1500), makeMemory('m1', 'A', 2000)],
      };

      const normA = normalizeMemoriesForSync(deviceA);
      const normB = normalizeMemoriesForSync(deviceB);

      const hashA = await hashJson(normA['book-1']);
      const hashB = await hashJson(normB['book-1']);
      expect(hashA).toBe(hashB);
    });
  });

  describe('novel stripping + canonical JSON', () => {
    const makeTranslation = (id: string, text: string): Translation => ({
      id,
      translation: text,
      aiModelId: 'model-1',
    });

    const makeParagraph = (id: string, text: string, translations: Translation[]): Paragraph => ({
      id,
      text,
      selectedTranslationId: translations[0]?.id ?? '',
      translations,
    });

    const makeNovel = (): Novel =>
      ({
        id: 'n1',
        title: 'Test Novel',
        lastEdited: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        volumes: [
          {
            id: 'v1',
            title: 'Vol 1',
            chapters: [
              {
                id: 'c1',
                title: 'Ch 1',
                lastEdited: new Date('2026-01-01T00:00:00Z'),
                createdAt: new Date('2026-01-01T00:00:00Z'),
                content: [
                  makeParagraph('p1', '原文1', [makeTranslation('t1', '译文1')]),
                  makeParagraph('p2', '原文2', [makeTranslation('t2', '译文2')]),
                ],
              },
            ],
          },
        ],
      }) as unknown as Novel;

    it('hashes identically regardless of memoryScoreBreakdown presence (stripped)', async () => {
      const deviceA = makeNovel();
      // 模拟翻译刚跑完：每条 translation 被注入了 memoryScoreBreakdown
      const trA = deviceA.volumes?.[0]?.chapters?.[0]?.content?.[0]?.translations?.[0];
      if (trA) {
        (trA as Translation & { memoryScoreBreakdown?: unknown }).memoryScoreBreakdown = {
          'mem-1': {
            semantic: 0.8,
            keyword: 0.5,
            recency: 0.9,
            semanticWeighted: 0.48,
            keywordWeighted: 0.15,
            recencyWeighted: 0.09,
            total: 0.72,
          },
        };
      }
      const deviceB = makeNovel();

      const hashA = await hashJson(stripNovelLocalFields(deviceA));
      const hashB = await hashJson(stripNovelLocalFields(deviceB));
      expect(hashA).toBe(hashB);
    });
  });
});
