import { ref, computed, nextTick, type Ref } from 'vue';
import { cloneDeep } from 'lodash';
import type { Novel } from 'src/models/novel';
import type { AppLocale } from 'src/models/locale';
import { generateShortId } from 'src/utils/id-generator';

export interface TranslationUndoScope {
  kind: 'translation';
  language: AppLocale;
  chapterId: string;
}

/**
 * 撤销/重做历史记录项
 */
interface HistoryItem {
  book: Novel;
  timestamp: number;
  description?: string;
  scope?: TranslationUndoScope;
  /** 首次应用时分配；失败留在栈中重试时沿用，使恢复操作幂等 */
  operationId?: string;
}

/** 本条历史的恢复操作 ID：同一条历史的重试保持不变，移到另一个栈的新条目重新分配 */
function historyOperationId(item: HistoryItem): string {
  item.operationId ??= generateShortId();
  return item.operationId;
}

/**
 * 撤销/重做功能 Composable
 * @param bookRef 书籍的响应式引用
 * @param onStateChange 状态变化回调函数，用于保存书籍；operationId 在同一条历史失败重试时保持不变
 * @param getEnhancedBook 可选的函数，用于获取增强的书籍对象（例如包含当前已加载的章节内容）
 */
export function useUndoRedo(
  bookRef: Ref<Novel | undefined>,
  onStateChange: (
    book: Novel,
    scope: TranslationUndoScope | undefined,
    operationId: string,
  ) => Promise<void> | void,
  getEnhancedBook?: () => Novel | undefined,
) {
  // 历史记录栈（撤销栈）
  const undoStack = ref<HistoryItem[]>([]);
  // 重做栈
  const redoStack = ref<HistoryItem[]>([]);
  // 最大历史记录数量
  const maxHistorySize = 50;
  // 是否正在执行撤销/重做操作（避免循环）
  const isUndoing = ref(false);

  /**
   * 是否可以撤销
   */
  const canUndo = computed(() => undoStack.value.length > 0 && !isUndoing.value);

  /**
   * 是否可以重做
   */
  const canRedo = computed(() => redoStack.value.length > 0 && !isUndoing.value);

  /**
   * 获取撤销描述
   */
  const undoDescription = computed(() => {
    if (undoStack.value.length === 0) return undefined;
    const lastItem = undoStack.value[undoStack.value.length - 1];
    return lastItem?.description;
  });

  /**
   * 获取重做描述
   */
  const redoDescription = computed(() => {
    if (redoStack.value.length === 0) return undefined;
    const lastItem = redoStack.value[redoStack.value.length - 1];
    return lastItem?.description;
  });

  /**
   * 保存当前状态到历史记录
   * @param description 操作描述（可选）
   */
  const saveState = (description?: string, scope?: TranslationUndoScope) => {
    const bookToSave = getEnhancedBook ? getEnhancedBook() : bookRef.value;
    if (!bookToSave || isUndoing.value) return;

    const historyItem: HistoryItem = {
      book: cloneDeep(bookToSave),
      timestamp: Date.now(),
    };
    if (description !== undefined) historyItem.description = description;
    if (scope) historyItem.scope = cloneDeep(scope);

    undoStack.value.push(historyItem);
    if (undoStack.value.length > maxHistorySize) undoStack.value.shift();

    // 新操作出现，作废之前的重做栈
    redoStack.value = [];
  };

  /**
   * 撤销操作
   */
  const undo = async () => {
    if (!canUndo.value || isUndoing.value) return;

    // 使用增强函数获取书籍对象，如果没有提供则使用原始的 bookRef.value
    const currentBook = getEnhancedBook ? getEnhancedBook() : bookRef.value;
    if (!currentBook) return;

    isUndoing.value = true;

    try {
      // 将当前状态保存到重做栈
      const currentState = cloneDeep(currentBook);

      // 从撤销栈获取上一个状态
      const previousState = undoStack.value.at(-1);
      if (!previousState) {
        isUndoing.value = false;
        return;
      }

      // 将当前状态保存到重做栈（在恢复之前保存，确保可以重做）
      await onStateChange(
        cloneDeep(previousState.book),
        previousState.scope,
        historyOperationId(previousState),
      );
      undoStack.value.pop();
      redoStack.value.push({
        book: currentState,
        timestamp: Date.now(),
        ...(previousState.scope ? { scope: cloneDeep(previousState.scope) } : {}),
        // 不复制描述，因为重做时的描述应该是"重做"而不是原操作描述
      });

      // 恢复上一个状态（通过 onStateChange 回调更新，而不是直接修改 ref）
      // 注意：如果 bookRef 是 computed，不能直接赋值，需要通过 onStateChange 更新 store

      // 等待下一个 tick，确保响应式更新已传播
      await nextTick();
    } finally {
      isUndoing.value = false;
    }
  };

  /**
   * 重做操作
   */
  const redo = async () => {
    if (!canRedo.value || isUndoing.value) return;

    // 使用增强函数获取书籍对象，如果没有提供则使用原始的 bookRef.value
    const currentBook = getEnhancedBook ? getEnhancedBook() : bookRef.value;
    if (!currentBook) return;

    isUndoing.value = true;

    try {
      // 将当前状态保存到撤销栈
      const currentState = cloneDeep(currentBook);

      // 从重做栈获取下一个状态
      const nextState = redoStack.value.at(-1);
      if (!nextState) {
        isUndoing.value = false;
        return;
      }

      // 将当前状态保存到撤销栈（在恢复之前保存，确保可以撤销）
      await onStateChange(
        cloneDeep(nextState.book),
        nextState.scope,
        historyOperationId(nextState),
      );
      redoStack.value.pop();
      undoStack.value.push({
        book: currentState,
        timestamp: Date.now(),
        ...(nextState.scope ? { scope: cloneDeep(nextState.scope) } : {}),
        // 不复制描述，因为撤销时的描述应该是"撤销"而不是原操作描述
      });

      // 恢复下一个状态（通过 onStateChange 回调更新，而不是直接修改 ref）
      // 注意：如果 bookRef 是 computed，不能直接赋值，需要通过 onStateChange 更新 store

      // 等待下一个 tick，确保响应式更新已传播
      await nextTick();
    } finally {
      isUndoing.value = false;
    }
  };

  /**
   * 清空历史记录
   */
  const clearHistory = () => {
    undoStack.value = [];
    redoStack.value = [];
  };

  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    saveState,
    undo,
    redo,
    clearHistory,
  };
}
