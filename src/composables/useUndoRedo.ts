import { ref, computed, type Ref } from 'vue';
import { cloneDeep } from 'lodash';
import type { Novel } from 'src/models/novel';

/**
 * 撤销/重做历史记录项
 */
interface HistoryItem {
  book: Novel;
  timestamp: number;
  description?: string;
}

/**
 * 撤销/重做功能 Composable
 * @param bookRef 书籍的响应式引用
 * @param onStateChange 状态变化回调函数，用于保存书籍
 */
export function useUndoRedo(
  bookRef: Ref<Novel | undefined>,
  onStateChange: (book: Novel) => Promise<void> | void,
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
  const saveState = (description?: string) => {
    if (!bookRef.value || isUndoing.value) return;

    // 深拷贝当前书籍状态
    const currentState = cloneDeep(bookRef.value);

    // 添加到撤销栈
    const historyItem: HistoryItem = {
      book: currentState,
      timestamp: Date.now(),
    };
    if (description !== undefined) {
      historyItem.description = description;
    }
    undoStack.value.push(historyItem);

    // 限制历史记录数量
    if (undoStack.value.length > maxHistorySize) {
      undoStack.value.shift();
    }

    // 执行新操作时，清空重做栈
    redoStack.value = [];
  };

  /**
   * 撤销操作
   */
  const undo = async () => {
    if (!canUndo.value || !bookRef.value) return;

    isUndoing.value = true;

    try {
      // 将当前状态保存到重做栈
      const currentState = cloneDeep(bookRef.value);
      redoStack.value.push({
        book: currentState,
        timestamp: Date.now(),
      });

      // 从撤销栈获取上一个状态
      const previousState = undoStack.value.pop();
      if (!previousState) {
        isUndoing.value = false;
        return;
      }

      // 恢复上一个状态（通过 onStateChange 回调更新，而不是直接修改 ref）
      // 注意：如果 bookRef 是 computed，不能直接赋值，需要通过 onStateChange 更新 store
      await onStateChange(cloneDeep(previousState.book));
    } finally {
      isUndoing.value = false;
    }
  };

  /**
   * 重做操作
   */
  const redo = async () => {
    if (!canRedo.value || !bookRef.value) return;

    isUndoing.value = true;

    try {
      // 将当前状态保存到撤销栈
      const currentState = cloneDeep(bookRef.value);
      undoStack.value.push({
        book: currentState,
        timestamp: Date.now(),
      });

      // 从重做栈获取下一个状态
      const nextState = redoStack.value.pop();
      if (!nextState) {
        isUndoing.value = false;
        return;
      }

      // 恢复下一个状态（通过 onStateChange 回调更新，而不是直接修改 ref）
      // 注意：如果 bookRef 是 computed，不能直接赋值，需要通过 onStateChange 更新 store
      await onStateChange(cloneDeep(nextState.book));
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
