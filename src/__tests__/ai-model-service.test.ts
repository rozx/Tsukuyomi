import { describe, expect, it, mock, beforeEach } from 'bun:test';
import './setup';
import { aiModelService } from '../services/ai-model-service';
import type { AIModel } from '../services/ai/types/ai-model';

describe('AIModelService', () => {
  beforeEach(() => {});

  it('should get all models', async () => {
    const models = await aiModelService.getAllModels();
    expect(models).toEqual([]);
  });

  it('should get a model by id', async () => {
    await aiModelService.clearModels();
    const mockModel = { id: '1', name: 'Test Model' };

    await aiModelService.saveModel(mockModel as AIModel);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const model = await aiModelService.getModel('1');
    expect(model).toEqual(mockModel as unknown as AIModel);
  });

  it('should save a model', async () => {
    await aiModelService.clearModels();
    const model = { id: '1', name: 'Test Model' } as AIModel;
    await aiModelService.saveModel(model);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = await aiModelService.getModel('1');
    expect(saved).toEqual(model);
  });

  it('should bulk save models', async () => {
    await aiModelService.clearModels();
    const models = [
      { id: '1', name: 'Model 1' },
      { id: '2', name: 'Model 2' },
    ] as AIModel[];

    await aiModelService.bulkSaveModels(models);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = await aiModelService.getAllModels();
    expect(saved).toHaveLength(2);
  });

  it('should delete a model', async () => {
    await aiModelService.clearModels();
    await aiModelService.saveModel({ id: '1', name: 'Test Model' } as AIModel);
    await aiModelService.deleteModel('1');
    const model = await aiModelService.getModel('1');
    expect(model).toBeUndefined();
  });

  it('should clear all models', async () => {
    await aiModelService.saveModel({ id: '1', name: 'Test Model' } as AIModel);
    await aiModelService.clearModels();
    const models = await aiModelService.getAllModels();
    expect(models).toHaveLength(0);
  });
});
