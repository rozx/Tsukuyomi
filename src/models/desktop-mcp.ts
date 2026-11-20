export type DesktopMcpServerState = 'stopped' | 'starting' | 'running' | 'error';

export interface DesktopMcpServerStatus {
  state: DesktopMcpServerState;
  port: number | null;
  error: string | null;
}

export interface DesktopMcpStartConfig {
  port: number;
  authToken: string;
}

export type DesktopMcpMethod = 'tools/list' | 'tools/call' | 'prompts/list' | 'prompts/get';

/** 需要更长 IPC 超时的外部工具名称清单，实际超时时长由主进程协调器统一配置 */
export const DESKTOP_MCP_LONG_OPERATION_TOOLS = [
  'import_book_from_url',
  'add_chapters',
  'check_book_updates',
  'apply_book_updates',
  // 不指定章节时要读全书正文
  'search_paragraphs',
  // 各卷翻译进度要读全书正文
  'get_book',
  'count_occurrences',
  'replace_in_translations',
] as const;

export interface DesktopMcpIpcRequest {
  requestId: string;
  method: DesktopMcpMethod;
  params: Record<string, unknown>;
}

export interface DesktopMcpIpcResponse {
  requestId: string;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

export interface DesktopMcpAPI {
  start: (config: DesktopMcpStartConfig) => Promise<DesktopMcpServerStatus>;
  stop: () => Promise<DesktopMcpServerStatus>;
  updateConfig: (config: DesktopMcpStartConfig) => Promise<DesktopMcpServerStatus>;
  getStatus: () => Promise<DesktopMcpServerStatus>;
  onStatus: (callback: (status: DesktopMcpServerStatus) => void) => () => void;
  onRequest: (callback: (request: DesktopMcpIpcRequest) => void) => () => void;
  sendResponse: (response: DesktopMcpIpcResponse) => void;
  /** 渲染进程已注册请求监听后调用；主进程在收到之前不会向渲染进程转发请求 */
  notifyReady: () => void;
}
