/**
 * Electron API 类型声明
 * 通过 preload 脚本暴露给渲染进程的 API
 */

export interface ElectronAPI {
  /**
   * 通过 Electron 的 net 模块发起 HTTP 请求
   * 避免浏览器的 CORS 限制
   */
  fetch: (
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ) => Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: string;
  }>;

  /**
   * 检查是否在 Electron 环境中
   */
  isElectron: boolean;

  /**
   * 获取 Electron 版本信息
   */
  versions: {
    node: () => string;
    chrome: () => string;
    electron: () => string;
  };

  /**
   * 设置相关的 IPC 通信
   */
  settings: {
    /**
     * 注册导出设置请求监听器
     * @param callback 回调函数（可以是异步的）
     * @returns 清理函数，调用它来移除这个监听器
     */
    onExportRequest: (callback: (filePath: string) => void | Promise<void>) => () => void;
    /**
     * 注册导入设置数据监听器
     * @param callback 回调函数
     * @returns 清理函数，调用它来移除这个监听器
     */
    onImportData: (callback: (content: string) => void) => () => void;
    saveExport: (filePath: string, data: string) => void;
    removeListeners: () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
