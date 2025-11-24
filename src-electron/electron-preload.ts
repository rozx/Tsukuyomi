import { contextBridge, ipcRenderer } from 'electron';

/**
 * Electron Preload Script
 * 为渲染进程提供安全的 API 访问
 */

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 通过 Electron 的 net 模块发起 HTTP 请求
   * 避免浏览器的 CORS 限制
   */
  fetch: async (
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ) => {
    return await ipcRenderer.invoke('electron-fetch', url, options);
  },

  /**
   * 检查是否在 Electron 环境中
   */
  isElectron: true,

  /**
   * 获取 Electron 版本信息
   */
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  },
});

// 类型声明已移至 src/types/electron.d.ts
