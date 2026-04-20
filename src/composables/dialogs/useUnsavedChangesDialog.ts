import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { isEqual } from 'lodash';

interface UnsavedDialogEmit {
  (event: 'cancel'): void;
  (event: 'update:visible', value: boolean): void;
}

/**
 * 对话框「未保存更改」关闭确认 composable。
 *
 * 统一封装 AIModelDialog / BookDialog 等表单对话框的二次确认逻辑：
 * 关闭时检查是否存在未保存修改，如有则弹出确认对话框，用户可选择继续编辑或放弃修改。
 *
 * @param params.hasUnsavedChanges  表单是否有未保存修改（响应式）
 * @param params.loading            （可选）对话框是否处于加载/保存中，处于加载中时禁止关闭
 * @param params.emit               宿主组件的 emit 函数，用于触发 `update:visible`
 * @param params.closeDialogImmediately  实际关闭对话框的函数（通常会 emit `cancel` + `update:visible=false`）
 */
export function useUnsavedChangesDialog(params: {
  hasUnsavedChanges: Ref<boolean> | ComputedRef<boolean>;
  loading?: Ref<boolean> | ComputedRef<boolean>;
  emit: UnsavedDialogEmit;
  closeDialogImmediately: () => void;
}) {
  const { hasUnsavedChanges, loading, emit, closeDialogImmediately } = params;

  // 控制「放弃未保存修改」确认对话框的显示
  const showUnsavedCloseConfirm = ref(false);

  // 请求关闭：根据是否有未保存修改决定直接关闭还是弹出二次确认
  const requestCloseDialog = () => {
    // 正在加载/保存时禁止关闭（仅在传入 loading 参数时生效）
    if (loading?.value) {
      return;
    }

    if (hasUnsavedChanges.value) {
      showUnsavedCloseConfirm.value = true;
      return;
    }

    closeDialogImmediately();
  };

  // 用户确认放弃修改：关闭确认框 + 关闭主对话框
  const confirmDiscardAndClose = () => {
    showUnsavedCloseConfirm.value = false;
    closeDialogImmediately();
  };

  // 用户选择继续编辑：仅关闭确认框
  const cancelDiscardAndKeepEditing = () => {
    showUnsavedCloseConfirm.value = false;
  };

  // 响应 AdaptiveDialog 的 visible 变更：打开时直接透传，关闭时走 requestCloseDialog
  const handleDialogVisibleChange = (nextVisible: boolean) => {
    if (nextVisible) {
      emit('update:visible', true);
      return;
    }
    requestCloseDialog();
  };

  return {
    showUnsavedCloseConfirm,
    requestCloseDialog,
    confirmDiscardAndClose,
    cancelDiscardAndKeepEditing,
    handleDialogVisibleChange,
  };
}

/**
 * 表单对话框的完整关闭守卫，包含初始快照、`hasUnsavedChanges` 计算以及
 * `closeDialogImmediately` 默认实现（emit 'cancel' + 'update:visible=false'）。
 *
 * 适用于 AIModelDialog / BookDialog 等「打开时保存快照、关闭时比较 formData」的表单弹窗。
 * 宿主只需提供表单数据 Ref、对话框 visible 状态以及 emit。
 */
export function useFormDialogCloseGuard<T>(params: {
  formData: Ref<T>;
  visible: Ref<boolean> | ComputedRef<boolean>;
  loading?: Ref<boolean> | ComputedRef<boolean>;
  emit: UnsavedDialogEmit;
}) {
  const { formData, visible, loading, emit } = params;

  const initialFormSnapshot = ref<T | null>(null) as Ref<T | null>;

  const hasUnsavedChanges = computed(() => {
    if (!visible.value || !initialFormSnapshot.value) {
      return false;
    }
    return !isEqual(initialFormSnapshot.value, formData.value);
  });

  const closeDialogImmediately = () => {
    emit('cancel');
    emit('update:visible', false);
  };

  const guards = useUnsavedChangesDialog({
    hasUnsavedChanges,
    ...(loading ? { loading } : {}),
    emit,
    closeDialogImmediately,
  });

  return {
    initialFormSnapshot,
    hasUnsavedChanges,
    closeDialogImmediately,
    ...guards,
  };
}
