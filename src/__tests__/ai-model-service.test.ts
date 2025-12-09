// 必须在所有其他导入之前导入 setup，以确保 polyfill 在 idb 库导入之前设置
import './setup';

import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { aiModelService } from '../services/ai-model-service';
import type { AIModel } from '../services/ai/types/ai-model';

// Mock objects
const mockPut = mock((_storeName: string, _value: unknown) => Promise.resolve(undefined));
const mockGetAll = mock((_storeName: string) => Promise.resolve([]));
const mockGet = mock((_storeName: string, _key: string) => Promise.resolve(undefined as unknown));
const mockDelete = mock((_storeName: string, _key: string) => Promise.resolve(undefined));
const mockClear = mock((_storeName: string) => Promise.resolve(undefined));
const mockStorePut = mock(() => Promise.resolve(undefined));
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
await mock.module('src/utils/indexed-db', () => ({
  getDB: () => Promise.resolve(mockDb),
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

