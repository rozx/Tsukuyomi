import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { aiModelService } from '../services/ai-model-service';
import type { AIModel } from '../types/ai/ai-model';

// Mock objects
const mockPut = mock(async () => undefined);
const mockGetAll = mock(async () => []);
const mockGet = mock(async () => undefined);
const mockDelete = mock(async () => undefined);
const mockClear = mock(async () => undefined);
const mockStorePut = mock(async () => undefined);
const mockTransaction = mock(() => ({
  objectStore: () => ({
    put: mockStorePut,
  }),
  done: Promise.resolve(),
}));

const mockDb = {
  getAll: mockGetAll,
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
  clear: mockClear,
  transaction: mockTransaction,
};

// Mock the module
mock.module('src/utils/indexed-db', () => ({
  getDB: async () => mockDb,
}));

describe('AIModelService', () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockGetAll.mockClear();
    mockGet.mockClear();
    mockDelete.mockClear();
    mockClear.mockClear();
    mockStorePut.mockClear();
    mockTransaction.mockClear();
  });

  it('should get all models', async () => {
    mockGetAll.mockResolvedValueOnce([]);
    const models = await aiModelService.getAllModels();
    expect(models).toEqual([]);
    expect(mockGetAll).toHaveBeenCalledWith('ai-models');
  });

  it('should get a model by id', async () => {
    const mockModel = { id: '1', name: 'Test Model' };
    mockGet.mockResolvedValueOnce(mockModel);

    const model = await aiModelService.getModel('1');
    expect(model).toEqual(mockModel as unknown as AIModel);
    expect(mockGet).toHaveBeenCalledWith('ai-models', '1');
  });

  it('should save a model', async () => {
    const model = { id: '1', name: 'Test Model' } as AIModel;
    await aiModelService.saveModel(model);
    expect(mockPut).toHaveBeenCalledWith('ai-models', model);
  });

  it('should bulk save models', async () => {
    const models = [
      { id: '1', name: 'Model 1' },
      { id: '2', name: 'Model 2' },
    ] as AIModel[];

    await aiModelService.bulkSaveModels(models);
    expect(mockTransaction).toHaveBeenCalledWith('ai-models', 'readwrite');
    expect(mockStorePut).toHaveBeenCalledTimes(2);
  });

  it('should delete a model', async () => {
    await aiModelService.deleteModel('1');
    expect(mockDelete).toHaveBeenCalledWith('ai-models', '1');
  });

  it('should clear all models', async () => {
    await aiModelService.clearModels();
    expect(mockClear).toHaveBeenCalledWith('ai-models');
  });
});

