/**
 * 浏览器版的 WebMCP 本地中继桥接（@mcp-b/webmcp-local-relay）。
 *
 * 开启后做两件事：
 * 1. 动态加载页面运行时 @mcp-b/global，让 `document.modelContext` 存在（不依赖浏览器实验开关）；
 * 2. 注入中继的 embed 脚本，它会创建一个隐藏 iframe，通过本机 WebSocket 把本页注册的工具
 *    转发给用户本机运行的中继进程，本地 Agent 再经 stdio 连接该进程。
 *
 * embed.js 与 widget.html 随应用分发在 public/webmcp-relay/，不从 CDN 加载。
 */

/** 中继 embed 脚本相对应用根路径的位置；同目录下必须有 widget.html */
export const WEBMCP_RELAY_EMBED_PATH = 'webmcp-relay/embed.js';

const SCRIPT_MARKER = 'data-agent-mcp-relay';
/** embed.js 给它创建的隐藏 iframe 打的标记 */
const WIDGET_FRAME_SELECTOR = '[data-webmcp-relay]';

export interface WebMcpPageRuntime {
  initializeWebModelContext: (options?: {
    transport?: { tabServer?: { allowedOrigins: string[] } | false };
  }) => void;
  cleanupWebModelContext: () => void;
}

export type WebMcpRelayEnableResult = 'enabled' | 'insecure' | 'failed';

export interface WebMcpRelayBridge {
  enable: () => Promise<WebMcpRelayEnableResult>;
  disable: () => void;
  isEnabled: () => boolean;
}

export interface CreateWebMcpRelayBridgeOptions {
  /** 加载页面运行时；默认动态 import @mcp-b/global（不进主 bundle） */
  loadRuntime?: () => Promise<WebMcpPageRuntime>;
  /** 应用部署的根路径，默认取构建时的 BASE_URL */
  baseUrl?: string;
}

function defaultBaseUrl(): string {
  const base = import.meta.env?.BASE_URL;
  return typeof base === 'string' && base ? base : '/';
}

export function createWebMcpRelayBridge(
  options: CreateWebMcpRelayBridgeOptions = {},
): WebMcpRelayBridge {
  const loadRuntime =
    options.loadRuntime ?? (() => import('@mcp-b/global') as Promise<WebMcpPageRuntime>);
  const baseUrl = options.baseUrl ?? defaultBaseUrl();
  let runtime: WebMcpPageRuntime | null = null;
  let enabled = false;

  const removeRelayElements = (): void => {
    document.querySelectorAll(`script[${SCRIPT_MARKER}]`).forEach((el) => el.remove());
    // 移除 iframe 会关闭它到本机中继的 WebSocket
    document.querySelectorAll(WIDGET_FRAME_SELECTOR).forEach((el) => el.remove());
  };

  const injectRelayScript = (): void => {
    if (document.querySelector(`script[${SCRIPT_MARKER}]`)) return;
    const script = document.createElement('script');
    script.setAttribute(SCRIPT_MARKER, '1');
    script.src = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${WEBMCP_RELAY_EMBED_PATH}`;
    document.head.appendChild(script);
  };

  const enable = async (): Promise<WebMcpRelayEnableResult> => {
    if (enabled) return 'enabled';
    // 运行时与浏览器都只在安全上下文（HTTPS / localhost）提供 WebMCP
    if (typeof window === 'undefined' || window.isSecureContext === false) return 'insecure';
    try {
      if (!runtime) {
        // 运行时模块加载即自动初始化（任意来源均可连接）；先关闭，再用仅限本页来源的配置初始化
        (
          window as { __webModelContextOptions?: { autoInitialize?: boolean } }
        ).__webModelContextOptions = { autoInitialize: false };
        runtime = await loadRuntime();
      }
      runtime.initializeWebModelContext({
        transport: { tabServer: { allowedOrigins: [window.location.origin] } },
      });
      injectRelayScript();
      enabled = true;
      return 'enabled';
    } catch (error) {
      console.warn('[agent-mcp] WebMCP 中继初始化失败:', error);
      removeRelayElements();
      return 'failed';
    }
  };

  const disable = (): void => {
    if (!enabled) return;
    enabled = false;
    removeRelayElements();
    runtime?.cleanupWebModelContext();
  };

  return { enable, disable, isEnabled: () => enabled };
}
