/**
 * getModelForTask（本书任务模型覆盖）解析规则测试：
 * - 覆盖命中已启用模型 → 返回覆盖模型
 * - 覆盖模型被禁用 / 不存在 / 为 null / 未传 book → 回退全局默认
 * - 全局默认也缺失 → undefined
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import type { AIModel, TaskConfig } from 'src/services/ai/types/ai-model';
import type { Novel } from 'src/models/novel';

const taskOff: TaskConfig = { enabled: false, temperature: 0.7 };

const makeModel = (overrides: Partial<AIModel>): AIModel => ({
  id: 'model-id',
  name: '测试模型',
  provider: 'openai',
  model: 'gpt-test',
  temperature: 0.7,
  maxInputTokens: 0,
  maxOutputTokens: 0,
  apiKey: 'key',
  baseUrl: 'https://example.com',
  isDefault: {
    translation: taskOff,
    proofreading: taskOff,
    termsTranslation: taskOff,
    assistant: taskOff,
  },
  enabled: true,
  lastEdited: new Date(0),
  ...overrides,
});

const makeBook = (taskModelOverrides: Novel['taskModelOverrides']): Novel =>
  ({
    id: 'book-1',
    title: '测试书',
    volumes: [],
    taskModelOverrides,
  }) as unknown as Novel;

describe('aiModelsStore.getModelForTask（本书覆盖解析）', () => {
  let aiModelsStore: ReturnType<typeof useAIModelsStore>;
  let settingsStore: ReturnType<typeof useSettingsStore>;

  const globalDefault = makeModel({ id: 'global-default', name: '全局默认' });
  const overrideModel = makeModel({ id: 'override-model', name: '本书覆盖' });

  beforeEach(() => {
    aiModelsStore = useAIModelsStore();
    settingsStore = useSettingsStore();
    aiModelsStore.models = [globalDefault, overrideModel];
    settingsStore.settings.taskDefaultModels = { translation: 'global-default' };
  });

  it('覆盖命中已启用模型时返回覆盖模型', () => {
    const book = makeBook({ translation: 'override-model' });
    expect(aiModelsStore.getModelForTask('translation', book)?.id).toBe('override-model');
  });

  it('覆盖模型被禁用时静默回退全局默认', () => {
    aiModelsStore.models = [globalDefault, makeModel({ id: 'override-model', enabled: false })];
    const book = makeBook({ translation: 'override-model' });
    expect(aiModelsStore.getModelForTask('translation', book)?.id).toBe('global-default');
  });

  it('覆盖模型不存在时静默回退全局默认', () => {
    const book = makeBook({ translation: 'deleted-model' });
    expect(aiModelsStore.getModelForTask('translation', book)?.id).toBe('global-default');
  });

  it('覆盖为 null 时回退全局默认', () => {
    const book = makeBook({ translation: null });
    expect(aiModelsStore.getModelForTask('translation', book)?.id).toBe('global-default');
  });

  it('未传 book 时回退全局默认', () => {
    expect(aiModelsStore.getModelForTask('translation')?.id).toBe('global-default');
    expect(aiModelsStore.getModelForTask('translation', null)?.id).toBe('global-default');
  });

  it('book 无 taskModelOverrides 字段时行为与现状一致', () => {
    const book = makeBook(undefined);
    expect(aiModelsStore.getModelForTask('translation', book)?.id).toBe('global-default');
  });

  it('proofreading 覆盖独立于 translation 覆盖', () => {
    const book = makeBook({ proofreading: 'override-model' });
    settingsStore.settings.taskDefaultModels = {
      translation: 'global-default',
      proofreading: 'global-default',
    };
    expect(aiModelsStore.getModelForTask('proofreading', book)?.id).toBe('override-model');
    expect(aiModelsStore.getModelForTask('translation', book)?.id).toBe('global-default');
  });

  it('无覆盖且全局默认也缺失时返回 undefined', () => {
    settingsStore.settings.taskDefaultModels = {};
    const book = makeBook(undefined);
    expect(aiModelsStore.getModelForTask('translation', book)).toBeUndefined();
  });
});
