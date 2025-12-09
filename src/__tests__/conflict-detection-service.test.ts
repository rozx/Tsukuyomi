import { describe, expect, it } from 'bun:test';
import { ConflictDetectionService, ConflictType } from '../services/conflict-detection-service';
import type { Novel } from '../models/novel';
import type { AIModel } from '../services/ai/types/ai-model';
import type { AppSettings } from '../models/settings';
import type { CoverHistoryItem } from '../models/novel';

describe('冲突检测服务 (ConflictDetectionService)', () => {
  const baseDate = new Date('2024-01-01T00:00:00.000Z');
  const laterDate = new Date('2024-01-02T00:00:00.000Z');

  const createMockNovel = (id: string, lastEdited: Date, title: string = 'Test Novel'): Novel => ({
    id,
    title,
    author: 'Author',
    description: 'Desc',
    coverUrl: '',
    tags: [],
    volumes: [],
    createdAt: baseDate,
    lastEdited,
  });

  const createMockAIModel = (
    id: string,
    lastEdited: Date,
    name: string = 'Test Model',
  ): AIModel => ({
    id,
    name,
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'key',
    isCustom: true,
    lastEdited,
  });

  const createMockSettings = (lastEdited: Date): AppSettings => ({
    lastEdited,
    scraperConcurrencyLimit: 3,
    proxyEnabled: true,
    proxyUrl: '',
    proxyList: [],
  });

  const createMockCover = (id: string, addedAt: number): CoverHistoryItem => ({
    id,
    novelId: 'novel-1',
    url: 'http://example.com/cover.jpg',
    prompt: 'test prompt',
    addedAt,
  });

  describe('detectConflicts (检测冲突)', () => {
    it('当本地和远程数据完全一致时，不应返回冲突', () => {
      const novel = createMockNovel('1', baseDate);
      const model = createMockAIModel('1', baseDate);
      const settings = createMockSettings(baseDate);
      const cover = createMockCover('1', baseDate.getTime());

      const local = {
        novels: [novel],
        aiModels: [model],
        appSettings: settings,
        coverHistory: [cover],
      };

      const remote = {
        novels: [novel],
        aiModels: [model],
        appSettings: settings,
        coverHistory: [cover],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('当书籍内容不同时，应检测到冲突', () => {
      const localNovel = createMockNovel('1', baseDate, 'Local Title');
      const remoteNovel = createMockNovel('1', laterDate, 'Remote Title');

      const local = {
        novels: [localNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const remote = {
        novels: [remoteNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.Novel);
      expect(result.conflicts[0].id).toBe('1');
    });

    it('当 AI 模型内容不同时，应检测到冲突', () => {
      const localModel = createMockAIModel('1', baseDate, 'Local Model');
      const remoteModel = createMockAIModel('1', laterDate, 'Remote Model');

      const local = {
        novels: [],
        aiModels: [localModel],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const remote = {
        novels: [],
        aiModels: [remoteModel],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.AIModel);
    });

    it('当设置内容不同时，应检测到冲突', () => {
      const localSettings = createMockSettings(baseDate);
      const remoteSettings = { ...createMockSettings(laterDate), scraperConcurrencyLimit: 5 };

      const local = {
        novels: [],
        aiModels: [],
        appSettings: localSettings,
        coverHistory: [],
      };

      const remote = {
        novels: [],
        aiModels: [],
        appSettings: remoteSettings,
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.Settings);
    });

    it('当仅 lastEdited 时间不同时，不应检测到设置冲突', () => {
      const localSettings = createMockSettings(baseDate);
      const remoteSettings = createMockSettings(laterDate); // Only time differs

      const local = {
        novels: [],
        aiModels: [],
        appSettings: localSettings,
        coverHistory: [],
      };

      const remote = {
        novels: [],
        aiModels: [],
        appSettings: remoteSettings,
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(false);
    });

    it('应检测到封面历史冲突', () => {
      const localCover = createMockCover('1', baseDate.getTime());
      const remoteCover = {
        ...createMockCover('1', laterDate.getTime()),
        prompt: 'Changed Prompt',
      };

      const local = {
        novels: [],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [localCover],
      };

      const remote = {
        novels: [],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [remoteCover],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe(ConflictType.CoverHistory);
    });
  });

  describe('detectNovelConflicts 详情 (书籍冲突检测细节)', () => {
    it('应忽略本地新增的章节（不算冲突）', () => {
      const localNovel = createMockNovel('1', laterDate);
      localNovel.volumes = [
        {
          id: 'v1',
          title: 'V1',
          chapters: [
            { id: 'c1', title: 'C1', paragraphs: [] },
            { id: 'c2', title: 'C2', paragraphs: [] }, // New chapter
          ],
        },
      ];

      const remoteNovel = createMockNovel('1', baseDate);
      remoteNovel.volumes = [
        {
          id: 'v1',
          title: 'V1',
          chapters: [{ id: 'c1', title: 'C1', paragraphs: [] }],
        },
      ];

      const local = {
        novels: [localNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };
      const remote = {
        novels: [remoteNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(false);
    });

    it('应忽略远程新增的章节（不算冲突）', () => {
      const localNovel = createMockNovel('1', baseDate);
      localNovel.volumes = [
        {
          id: 'v1',
          title: 'V1',
          chapters: [{ id: 'c1', title: 'C1', paragraphs: [] }],
        },
      ];

      const remoteNovel = createMockNovel('1', laterDate);
      remoteNovel.volumes = [
        {
          id: 'v1',
          title: 'V1',
          chapters: [
            { id: 'c1', title: 'C1', paragraphs: [] },
            { id: 'c2', title: 'C2', paragraphs: [] }, // New chapter
          ],
        },
      ];

      const local = {
        novels: [localNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };
      const remote = {
        novels: [remoteNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(false);
    });

    it('如果同一章节标题不同，应检测到冲突', () => {
      const localNovel = createMockNovel('1', laterDate);
      localNovel.volumes = [
        {
          id: 'v1',
          title: 'V1',
          chapters: [{ id: 'c1', title: 'C1 Local', paragraphs: [] }],
        },
      ];

      const remoteNovel = createMockNovel('1', laterDate);
      remoteNovel.volumes = [
        {
          id: 'v1',
          title: 'V1',
          chapters: [{ id: 'c1', title: 'C1 Remote', paragraphs: [] }],
        },
      ];

      const local = {
        novels: [localNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };
      const remote = {
        novels: [remoteNovel],
        aiModels: [],
        appSettings: createMockSettings(baseDate),
        coverHistory: [],
      };

      const result = ConflictDetectionService.detectConflicts(local, remote);
      expect(result.hasConflicts).toBe(true);
    });
  });
});
