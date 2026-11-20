import type { WebMcpRelayState } from 'src/models/agent-mcp';

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

/**
 * - `insecure`：页面不在安全上下文，无法提供 WebMCP
 * - `legacy-native`：浏览器自带旧版 WebMCP 且无法在本页替换，中继转发不了工具
 * - `failed`：运行时加载或初始化失败
 * - `idle`：开启还没完成就被 disable() 取消了
 */
export type WebMcpRelayEnableResult = WebMcpRelayState;

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
  /** 探测浏览器自带的 WebMCP 是否为中继无法使用的旧版；默认做一次真实探测 */
  detectLegacyNative?: () => Promise<boolean>;
  /** 在本页移除旧版原生接口，成功返回 true；默认从 Document.prototype 上删除 */
  removeLegacyNative?: () => boolean;
}

const PROBE_TOOL_NAME = 'tsukuyomi_webmcp_probe';

interface NativeModelContextLike {
  registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => unknown;
  getTools?: () => Promise<Array<{ name?: string; inputSchema?: unknown }>>;
}

/**
 * 开着 WebMCP 实验开关的旧版 Chromium（155 之前）自带的 `document.modelContext`，
 * `getTools()` 会把工具的 inputSchema 以 JSON 字符串返回。中继组件遇到这种格式会拒绝转发，
 * 页面运行时也无法把这些工具暴露出去。这里临时注册一个探测工具来判断，用完即注销。
 */
async function detectLegacyNativeWebMcp(): Promise<boolean> {
  if (typeof document === 'undefined' || !('modelContext' in document)) return false;
  const native = (document as unknown as { modelContext?: NativeModelContextLike }).modelContext;
  if (typeof native?.registerTool !== 'function' || typeof native.getTools !== 'function') {
    return false;
  }
  const controller = new AbortController();
  try {
    await native.registerTool(
      {
        name: PROBE_TOOL_NAME,
        description: 'Temporary capability probe. Ignore.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => Promise.resolve('ok'),
      },
      { signal: controller.signal },
    );
    const tools = await native.getTools();
    return typeof tools.find((tool) => tool.name === PROBE_TOOL_NAME)?.inputSchema === 'string';
  } catch {
    // 探测不了就按新版处理，交给运行时自己判断
    return false;
  } finally {
    controller.abort();
  }
}

/** 从 Document.prototype 上移除原生接口，让运行时在本页安装 polyfill；刷新页面后恢复 */
function removeLegacyNativeWebMcp(): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'modelContext');
  if (!descriptor?.configurable) return false;
  delete (Document.prototype as { modelContext?: unknown }).modelContext;
  return !('modelContext' in document);
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
  const detectLegacyNative = options.detectLegacyNative ?? detectLegacyNativeWebMcp;
  const removeLegacyNative = options.removeLegacyNative ?? removeLegacyNativeWebMcp;
  /** 原生接口只需探测一次；替换成 polyfill 之后再探测没有意义 */
  let nativeChecked = false;
  let runtime: WebMcpPageRuntime | null = null;
  let enabled = false;
  /** 每次 disable() 加一：开启途中发现它变了，说明这次开启已经被取消 */
  let disableCount = 0;
  /** 进行中的开启；同一时间只跑一个 */
  let inFlight: Promise<WebMcpRelayEnableResult> | null = null;

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

  const runEnable = async (): Promise<WebMcpRelayEnableResult> => {
    // 运行时与浏览器都只在安全上下文（HTTPS / localhost）提供 WebMCP
    if (typeof window === 'undefined' || window.isSecureContext === false) return 'insecure';
    const startedAt = disableCount;
    try {
      if (!nativeChecked) {
        nativeChecked = true;
        if (await detectLegacyNative()) {
          if (!removeLegacyNative()) {
            // 换不掉就不要加载运行时：旧版接口上的工具既转发不出去，还会刷出大量告警
            nativeChecked = false;
            return 'legacy-native';
          }
          console.info('[agent-mcp] 浏览器自带的旧版 WebMCP 已在本页替换为 polyfill，刷新后恢复。');
        }
      }
      if (!runtime) {
        // 运行时模块加载即自动初始化（任意来源均可连接）；先关闭，再用仅限本页来源的配置初始化
        (
          window as { __webModelContextOptions?: { autoInitialize?: boolean } }
        ).__webModelContextOptions = { autoInitialize: false };
        runtime = await loadRuntime();
      }
      // 探测与加载都要等待；期间被关闭的话到此为止，不初始化运行时、不注入中继脚本
      if (startedAt !== disableCount) return 'idle';
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

  const enable = async (): Promise<WebMcpRelayEnableResult> => {
    // 上一次开启还没结束（可能已被取消）就等它结束，再按当时的状态决定
    while (inFlight) await inFlight;
    if (enabled) return 'enabled';
    const run = runEnable().finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run;
  };

  const disable = (): void => {
    disableCount += 1;
    if (!enabled) return;
    enabled = false;
    removeRelayElements();
    runtime?.cleanupWebModelContext();
  };

  return { enable, disable, isEnabled: () => enabled };
}
