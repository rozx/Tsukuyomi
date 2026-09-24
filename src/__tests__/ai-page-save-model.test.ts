/**
 * useAIPage 保存路径测试：AIModelDialog 收集的字段必须完整落盘。
 * - 新增模型：customHeaders 随模型一起保存
 * - 编辑模型：修改 / 清空 customHeaders 都要持久化
 * - 编辑模型：对话框没有输入项的字段（rateLimit）原样保留
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { createApp, h } from 'vue';
import type { App } from 'vue';
import { getActivePinia } from 'pinia';
import { provideAIPage } from 'src/composables/ai-page/useAIPage';
import type { AIPageContext } from 'src/composables/ai-page/useAIPage';
import { useAIModelsStore } from 'src/stores/ai-models';
import { aiModelService } from 'src/services/ai-model-service';
import type { AIModel, TaskConfig } from 'src/services/ai/types/ai-model';

vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }));

const taskOff: TaskConfig = { enabled: false, temperature: 0.7 };

type SaveFormData = Parameters<AIPageContext['handleSave']>[0];

const makeFormData = (overrides: Partial<SaveFormData> = {}): SaveFormData => ({
  name: '测试模型',
  provider: 'openai',
  model: 'gpt-test',
  temperature: 0.7,
  maxInputTokens: 0,
  maxOutputTokens: 0,
  apiKey: 'key',
  baseUrl: 'https://example.com',
  enabled: true,
  useCorsProxy: true,
  isDefault: {
    translation: taskOff,
    proofreading: taskOff,
    termsTranslation: taskOff,
    assistant: taskOff,
  },
  customHeaders: {},
  ...overrides,
});

let app: App | undefined;
let ctx: AIPageContext;

function mountPage() {
  const host = document.createElement('div');
  app = createApp({
    setup() {
      ctx = provideAIPage();
      return () => h('div');
    },
  });
  app.use(getActivePinia()!);
  app.mount(host);
  return useAIModelsStore();
}

async function seedModel(overrides: Partial<AIModel>): Promise<AIModel> {
  const store = useAIModelsStore();
  const model: AIModel = {
    ...(makeFormData() as AIModel),
    id: 'existing-model',
    lastEdited: new Date(0),
    ...overrides,
  };
  await store.addModel(model);
  return store.getModelById(model.id)!;
}

async function persisted(id: string): Promise<AIModel | undefined> {
  await vi.waitFor(async () => expect(await aiModelService.getModel(id)).toBeDefined());
  return aiModelService.getModel(id);
}

beforeEach(async () => {
  await aiModelService.clearModels();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe('useAIPage 保存模型', () => {
  it('新增和编辑后保留模型上限来源', async () => {
    const store = mountPage();
    await store.loadModels();
    ctx.addModel();
    ctx.handleSave(makeFormData({ limitsSource: 'catalog' }));
    const saved = store.models.find((m) => m.name === '测试模型')!;
    expect((await persisted(saved.id))?.limitsSource).toBe('catalog');
    ctx.editModel(saved);
    ctx.handleSave(makeFormData({ limitsSource: 'manual', maxInputTokens: 64000 }));
    await vi.waitFor(async () =>
      expect((await aiModelService.getModel(saved.id))?.limitsSource).toBe('manual'),
    );
  });

  it('思考等级经新增、编辑和恢复默认后完整落盘', async () => {
    const store = mountPage();
    await store.loadModels();
    ctx.addModel();
    ctx.handleSave(makeFormData({ thinkingLevel: 'high' }));
    const saved = store.models.find((m) => m.name === '测试模型')!;
    expect((await persisted(saved.id))?.thinkingLevel).toBe('high');
    ctx.editModel(store.getModelById(saved.id)!);
    ctx.handleSave(makeFormData({ customHeaders: { 'X-Edit': '1' } }));
    await vi.waitFor(async () =>
      expect((await aiModelService.getModel(saved.id))?.customHeaders).toEqual({ 'X-Edit': '1' }),
    );
    expect((await aiModelService.getModel(saved.id))?.thinkingLevel).toBe('high');
    ctx.editModel(store.getModelById(saved.id)!);
    ctx.handleSave(makeFormData({ thinkingLevel: 'provider-default' }));
    await vi.waitFor(async () =>
      expect((await aiModelService.getModel(saved.id))?.thinkingLevel).toBe('provider-default'),
    );
  });
  it('新增模型时保存 customHeaders', async () => {
    const store = mountPage();
    ctx.addModel();
    ctx.handleSave(makeFormData({ customHeaders: { 'User-Agent': 'MyTranslator/1.0' } }));

    const saved = store.models.find((m) => m.name === '测试模型');
    expect(saved?.customHeaders).toEqual({ 'User-Agent': 'MyTranslator/1.0' });
    expect((await persisted(saved!.id))?.customHeaders).toEqual({
      'User-Agent': 'MyTranslator/1.0',
    });
  });

  it('编辑模型时保存修改后的 customHeaders', async () => {
    const existing = await seedModel({ customHeaders: { 'X-Old': '1' } });
    const store = mountPage();
    ctx.editModel(existing);
    ctx.handleSave(makeFormData({ customHeaders: { 'X-New': '2' } }));

    expect(store.getModelById(existing.id)?.customHeaders).toEqual({ 'X-New': '2' });
    await vi.waitFor(async () =>
      expect((await aiModelService.getModel(existing.id))?.customHeaders).toEqual({ 'X-New': '2' }),
    );
  });

  it('编辑模型时清空 customHeaders 会持久化删除', async () => {
    const existing = await seedModel({ customHeaders: { 'X-Old': '1' } });
    const store = mountPage();
    ctx.editModel(existing);
    ctx.handleSave(makeFormData({ customHeaders: {} }));

    expect(store.getModelById(existing.id)?.customHeaders).toEqual({});
    await vi.waitFor(async () =>
      expect((await aiModelService.getModel(existing.id))?.customHeaders).toEqual({}),
    );
  });

  it('编辑模型时保留对话框未暴露的 rateLimit', async () => {
    const existing = await seedModel({ rateLimit: 30 });
    const store = mountPage();
    ctx.editModel(existing);
    // 对话框编辑模式会把原模型整体展开进 formData，rateLimit 随之回传
    ctx.handleSave(makeFormData({ rateLimit: 30 }));

    expect(store.getModelById(existing.id)?.rateLimit).toBe(30);
  });
});
