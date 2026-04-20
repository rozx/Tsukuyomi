import { ref } from 'vue';

/**
 * 文件导入触发的通用骨架：
 * - `fileInputRef` 绑定到 `<input type="file">`
 * - `triggerFilePicker()` 以编程方式打开文件选择对话框
 * - `createFileSelectHandler(onFile)` 返回一个 `change` 监听器；
 *   只有用户实际选中文件时才调用 `onFile`，并在处理结束后清空 input value
 *   以便用户能连续选择同一个文件。
 */
export function useFilePicker() {
  const fileInputRef = ref<HTMLInputElement | null>(null);

  const triggerFilePicker = () => {
    fileInputRef.value?.click();
  };

  const createFileSelectHandler = (onFile: (file: File) => Promise<void> | void) => {
    return async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      try {
        await onFile(file);
      } finally {
        target.value = '';
      }
    };
  };

  return { fileInputRef, triggerFilePicker, createFileSelectHandler };
}
