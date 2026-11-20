import type {
  RecordAgentMcpActivityInput,
  WebMcpRelayState,
  WebMcpRuntimeStatus,
} from 'src/models/agent-mcp';
import type { DesktopMcpAPI, DesktopMcpServerStatus } from 'src/models/desktop-mcp';
import { useSettingsStore } from 'src/stores/settings';
import { isElectron } from 'src/utils/platform';
import { configureAgentMcpKernelHooks, getAgentMcpKernel } from './index';
import { createDesktopMcpBridge, type DesktopMcpBridge } from './desktop-bridge';
import { createWebMcpAdapter, type WebMcpAdapter, type WebMcpEnvLike } from './webmcp-adapter';
import { createWebMcpRelayBridge, type WebMcpRelayBridge } from './webmcp-relay';
import type { AgentMcpWriteNotification } from './types';

export interface StartAgentMcpRuntimeOptions {
  isElectronEnv?: boolean;
  desktopApi?: DesktopMcpAPI | null;
  webMcpEnv?: () => WebMcpEnvLike;
  /**
   * 浏览器版的本地中继桥接。缺省时在真实浏览器环境创建；传 null 或注入了 webMcpEnv
   * （测试用的模拟宿主）时不创建。
   */
  webMcpRelay?: WebMcpRelayBridge | null;
  navigate?: (path: string) => Promise<void> | void;
  /** 用户当前所在的应用内路径，供 get_app_context 说明用户在哪个页面 */
  getCurrentPath?: () => string | null;
  onWriteNotify?: (info: AgentMcpWriteNotification) => void;
  onRecordActivity?: (entry: RecordAgentMcpActivityInput) => void;
  onDesktopStatusChange?: (status: DesktopMcpServerStatus) => void;
  onWebMcpStatusChange?: (status: WebMcpRuntimeStatus) => void;
  /** 浏览器端本地中继接通状态变化（含接不上的原因），用于界面提示 */
  onWebMcpRelayStateChange?: (state: WebMcpRelayState) => void;
}

export interface AgentMcpRuntimeHandle {
  syncNow: () => Promise<void>;
  dispose: () => void;
}

let activeRuntime: AgentMcpRuntimeHandle | null = null;
let activeDesktopBridge: DesktopMcpBridge | null = null;
let activeWebMcpAdapter: WebMcpAdapter | null = null;

export function getActiveDesktopMcpBridge(): DesktopMcpBridge | null {
  return activeDesktopBridge;
}

export function getActiveWebMcpAdapter(): WebMcpAdapter | null {
  return activeWebMcpAdapter;
}

export async function startAgentMcpRuntime(
  options: StartAgentMcpRuntimeOptions = {},
): Promise<AgentMcpRuntimeHandle> {
  if (activeRuntime) {
    activeRuntime.dispose();
  }

  configureAgentMcpKernelHooks({
    ...(options.navigate ? { navigate: options.navigate } : {}),
    ...(options.getCurrentPath ? { getCurrentPath: options.getCurrentPath } : {}),
    ...(options.onWriteNotify ? { onWriteNotify: options.onWriteNotify } : {}),
    ...(options.onRecordActivity ? { onRecordActivity: options.onRecordActivity } : {}),
  });

  const kernel = getAgentMcpKernel();
  const settingsStore = useSettingsStore();
  const electronMode = options.isElectronEnv ?? isElectron();
  const desktopApi =
    options.desktopApi !== undefined
      ? options.desktopApi
      : typeof window !== 'undefined'
        ? (window.electronAPI?.mcp ?? null)
        : null;

  let desktopBridge: DesktopMcpBridge | null = null;
  let webMcpAdapter: WebMcpAdapter | null = null;
  let webMcpRelay: WebMcpRelayBridge | null = null;

  if (electronMode && desktopApi) {
    desktopBridge = createDesktopMcpBridge({
      api: desktopApi,
      kernel,
      ...(options.onDesktopStatusChange ? { onStatusChange: options.onDesktopStatusChange } : {}),
    });
    desktopBridge.mount();
  } else if (!electronMode) {
    // Electron 渲染进程不注册 WebMCP；仅浏览器端初始化 WebMCP 适配器
    webMcpAdapter = createWebMcpAdapter({
      kernel,
      ...(options.onWebMcpStatusChange ? { onStatusChange: options.onWebMcpStatusChange } : {}),
      ...(options.webMcpEnv ? { env: options.webMcpEnv } : {}),
    });
    webMcpRelay =
      options.webMcpRelay !== undefined
        ? options.webMcpRelay
        : options.webMcpEnv
          ? null
          : createWebMcpRelayBridge();
  }

  activeDesktopBridge = desktopBridge;
  activeWebMcpAdapter = webMcpAdapter;

  let disposed = false;

  const syncDesktop = async (): Promise<void> => {
    if (disposed || !desktopBridge) return;
    const cfg = settingsStore.agentMcp;
    if (cfg.desktopServerEnabled) {
      await desktopBridge.start(await settingsStore.getDesktopMcpStartConfig());
    } else {
      await desktopBridge.syncStatus();
    }
  };

  const syncWebMcp = async (): Promise<void> => {
    if (disposed || !webMcpAdapter) return;
    if (settingsStore.agentMcp.webMcpEnabled) {
      // 先让 document.modelContext 存在并接上本机中继，再注册工具
      const relayState = await webMcpRelay?.enable();
      if (disposed) return;
      // 接通中继需要时间：期间开关被关掉的话不注册工具，按关闭处理
      if (settingsStore.agentMcp.webMcpEnabled) {
        if (relayState) options.onWebMcpRelayStateChange?.(relayState);
        await webMcpAdapter.sync(true);
        return;
      }
    }
    await webMcpAdapter.sync(false);
    webMcpRelay?.disable();
    if (webMcpRelay) options.onWebMcpRelayStateChange?.('idle');
  };

  /**
   * 同步按调用顺序一个接一个执行。设置的监听不等待上一次同步结束就会再次调用，
   * 交错执行会让较早的「开启」在较晚的「关闭」之后才完成，把已经关掉的通道重新打开。
   */
  let syncQueue: Promise<void> = Promise.resolve();
  const syncNow = (): Promise<void> => {
    const run = syncQueue.then(() => (electronMode ? syncDesktop() : syncWebMcp()));
    syncQueue = run.catch(() => undefined);
    return run;
  };

  const releaseChannels = (): void => {
    disposed = true;
    desktopBridge?.dispose();
    void webMcpAdapter?.unregisterAll();
    webMcpRelay?.disable();
    if (activeDesktopBridge === desktopBridge) activeDesktopBridge = null;
    if (activeWebMcpAdapter === webMcpAdapter) activeWebMcpAdapter = null;
  };

  try {
    await syncNow();
  } catch (error) {
    // 桥接此时已经挂上监听：首次同步失败就卸下，否则下次启动会再挂一份，每个请求被处理两次
    releaseChannels();
    throw error;
  }

  const handle: AgentMcpRuntimeHandle = {
    syncNow,
    dispose: () => {
      releaseChannels();
      if (activeRuntime === handle) activeRuntime = null;
    },
  };

  activeRuntime = handle;
  return handle;
}
