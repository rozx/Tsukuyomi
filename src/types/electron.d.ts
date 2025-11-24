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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
