import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { ref } from 'vue';
import {
  countUniqueActions,
  useActionInfoToast,
} from '../composables/book-details/useActionInfoToast';
import type { ActionInfo } from '../services/ai/tools/types';
import type { Novel, Terminology, CharacterSetting } from '../models/novel';
import { TerminologyService } from '../services/terminology-service';
import { CharacterSettingService } from '../services/character-setting-service';

// Mock dependencies
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

const mockBooksStoreGetBookById = mock(() => null);
const mockBooksStoreUpdateBook = mock(() => Promise.resolve());
const mockUseBooksStore = mock(() => ({
  getBookById: mockBooksStoreGetBookById,
  updateBook: mockBooksStoreUpdateBook,
}));

const mockDeleteTerminology = mock(() => Promise.resolve());
const mockUpdateTerminology = mock(() => Promise.resolve());
const mockDeleteCharacterSetting = mock(() => Promise.resolve());
const mockUpdateCharacterSetting = mock(() => Promise.resolve());

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));

await mock.module('src/stores/books', () => ({
  useBooksStore: mockUseBooksStore,
}));

// Mock static methods directly
const originalDeleteTerminology = TerminologyService.deleteTerminology;
const originalUpdateTerminology = TerminologyService.updateTerminology;
const originalDeleteCharacterSetting = CharacterSettingService.deleteCharacterSetting;
const originalUpdateCharacterSetting = CharacterSettingService.updateCharacterSetting;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
TerminologyService.deleteTerminology = mockDeleteTerminology;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
TerminologyService.updateTerminology = mockUpdateTerminology;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
CharacterSettingService.deleteCharacterSetting = mockDeleteCharacterSetting;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
CharacterSettingService.updateCharacterSetting = mockUpdateCharacterSetting;

import { afterAll } from 'bun:test';

afterAll(() => {
  // Restore original methods
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  TerminologyService.deleteTerminology = originalDeleteTerminology;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  TerminologyService.updateTerminology = originalUpdateTerminology;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  CharacterSettingService.deleteCharacterSetting = originalDeleteCharacterSetting;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  CharacterSettingService.updateCharacterSetting = originalUpdateCharacterSetting;
});

describe('countUniqueActions', () => {
  it('应该正确统计唯一的术语操作', () => {
    const actions: ActionInfo[] = [
      {
        entity: 'term',
        type: 'create',
        data: { id: 'term-1', name: '术语1' } as Terminology,
      },
      {
        entity: 'term',
        type: 'update',
        data: { id: 'term-2', name: '术语2' } as Terminology,
      },
      {
        entity: 'term',
        type: 'create',
        data: { id: 'term-1', name: '术语1' } as Terminology, // 重复
      },
    ];

    const result = countUniqueActions(actions);

    expect(result.terms).toBe(2); // term-1:create 和 term-2:update
    expect(result.characters).toBe(0);
  });

  it('应该正确统计唯一的角色操作', () => {
    const actions: ActionInfo[] = [
      {
        entity: 'character',
        type: 'create',
        data: { id: 'char-1', name: '角色1' } as CharacterSetting,
      },
      {
        entity: 'character',
        type: 'delete',
        data: { id: 'char-2', name: '角色2' } as { id: string; name?: string },
      },
      {
        entity: 'character',
        type: 'update',
        data: { id: 'char-1', name: '角色1' } as CharacterSetting, // 不同操作类型
      },
    ];

    const result = countUniqueActions(actions);

    expect(result.characters).toBe(3); // char-1:create, char-2:delete, char-1:update
    expect(result.terms).toBe(0);
  });

  it('应该忽略不支持的操作类型', () => {
    const actions: ActionInfo[] = [
      {
        entity: 'term',
        type: 'read',
        data: { id: 'term-1' } as Terminology,
      },
      {
        entity: 'term',
        type: 'create',
        data: { id: 'term-1', name: '术语1' } as Terminology,
      },
    ];

    const result = countUniqueActions(actions);

    expect(result.terms).toBe(1); // 只统计 create，忽略 read
  });

  it('应该忽略不支持的实体类型', () => {
    const actions: ActionInfo[] = [
      {
        entity: 'other' as any,
        type: 'create',
        data: { id: 'other-1' },
      },
      {
        entity: 'term',
        type: 'create',
        data: { id: 'term-1', name: '术语1' } as Terminology,
      },
    ];

    const result = countUniqueActions(actions);

    expect(result.terms).toBe(1); // 只统计 term，忽略 other
  });

  it('应该处理空数组', () => {
    const result = countUniqueActions([]);

    expect(result.terms).toBe(0);
    expect(result.characters).toBe(0);
  });

  it('应该处理没有 ID 的操作', () => {
    const actions: ActionInfo[] = [
      {
        entity: 'term',
        type: 'create',
        data: { name: '术语1' } as any, // 没有 id
      },
    ];

    const result = countUniqueActions(actions);

    expect(result.terms).toBe(0); // 没有 ID 的操作被忽略
  });
});

describe('useActionInfoToast', () => {
  let mockBook: Novel;

  beforeEach(() => {
    mockToastAdd.mockClear();
    mockBooksStoreGetBookById.mockClear();
    mockBooksStoreUpdateBook.mockClear();
    mockDeleteTerminology.mockClear();
    mockUpdateTerminology.mockClear();
    mockDeleteCharacterSetting.mockClear();
    mockUpdateCharacterSetting.mockClear();

    mockBook = {
      id: 'book-1',
      title: 'Test Book',
      lastEdited: new Date(),
      createdAt: new Date(),
    };
  });

  it('应该显示创建术语的 toast', () => {
    const bookRef = ref<Novel | undefined>(mockBook);
    const { handleActionInfoToast } = useActionInfoToast(bookRef);

    const action: ActionInfo = {
      entity: 'term',
      type: 'create',
      data: {
        id: 'term-1',
        name: '测试术语',
        translation: { id: 'trans-1', translation: 'test term', aiModelId: 'model-1' },
      } as Terminology,
    };

    handleActionInfoToast(action);

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const callArgs = calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.severity).toBe('info');
    expect(callArgs.summary).toBe('已创建术语');
    expect(callArgs.detail).toContain('术语 "测试术语"');
  });

  it('应该显示更新角色的 toast', () => {
    const bookRef = ref<Novel | undefined>(mockBook);
    const { handleActionInfoToast } = useActionInfoToast(bookRef);

    const action: ActionInfo = {
      entity: 'character',
      type: 'update',
      data: {
        id: 'char-1',
        name: '测试角色',
        translation: { id: 'trans-1', translation: 'test character', aiModelId: 'model-1' },
      } as CharacterSetting,
    };

    handleActionInfoToast(action);

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const callArgs = calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.summary).toBe('已更新角色');
    expect(callArgs.detail).toContain('角色 "测试角色"');
  });

  it('应该显示删除术语的 toast', () => {
    const bookRef = ref<Novel | undefined>(mockBook);
    const { handleActionInfoToast } = useActionInfoToast(bookRef);

    const action: ActionInfo = {
      entity: 'term',
      type: 'delete',
      data: { id: 'term-1', name: '测试术语' },
    };

    handleActionInfoToast(action);

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const callArgs = calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.summary).toBe('已删除术语');
    expect(callArgs.detail).toContain('术语 "测试术语"');
  });

  it('应该忽略不支持的操作类型', () => {
    const bookRef = ref<Novel | undefined>(mockBook);
    const { handleActionInfoToast } = useActionInfoToast(bookRef);

    const action: ActionInfo = {
      entity: 'term',
      type: 'read',
      data: { id: 'term-1' } as any,
    };

    handleActionInfoToast(action);

    expect(mockToastAdd).not.toHaveBeenCalled();
  });

  it('应该使用自定义的 severity', () => {
    const bookRef = ref<Novel | undefined>(mockBook);
    const { handleActionInfoToast } = useActionInfoToast(bookRef);

    const action: ActionInfo = {
      entity: 'term',
      type: 'create',
      data: { id: 'term-1', name: '测试术语' } as Terminology,
    };

    handleActionInfoToast(action, { severity: 'success' });

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const callArgs = calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.severity).toBe('success');
  });

  it('应该支持撤销功能', () => {
    const bookRef = ref<Novel | undefined>(mockBook);
    const { handleActionInfoToast } = useActionInfoToast(bookRef);

    const action: ActionInfo = {
      entity: 'term',
      type: 'create',
      data: { id: 'term-1', name: '测试术语' } as Terminology,
    };

    handleActionInfoToast(action, { withRevert: true });

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const callArgs = calls[0]?.[0] as any;
    expect(callArgs).toBeDefined();
    expect(callArgs.onRevert).toBeDefined();
    expect(typeof callArgs.onRevert).toBe('function');
  });
});
