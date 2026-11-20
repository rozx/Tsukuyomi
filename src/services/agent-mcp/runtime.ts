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
    const cfg = settingsStore.agentMcp;
    if (cfg.webMcpEnabled) {
      // 先让 document.modelContext 存在并接上本机中继，再注册工具
      const relayState = await webMcpRelay?.enable();
      if (relayState) options.onWebMcpRelayStateChange?.(relayState);
      await webMcpAdapter.sync(true);
    } else {
      await webMcpAdapter.sync(false);
      webMcpRelay?.disable();
      if (webMcpRelay) options.onWebMcpRelayStateChange?.('idle');
    }
  };

  const syncNow = async (): Promise<void> => {
    if (electronMode) {
      await syncDesktop();
    } else {
      await syncWebMcp();
    }
  };

  await syncNow();

  const handle: AgentMcpRuntimeHandle = {
    syncNow,
    dispose: () => {
      disposed = true;
      desktopBridge?.dispose();
      void webMcpAdapter?.unregisterAll();
      webMcpRelay?.disable();
      if (activeDesktopBridge === desktopBridge) activeDesktopBridge = null;
      if (activeWebMcpAdapter === webMcpAdapter) activeWebMcpAdapter = null;
      if (activeRuntime === handle) activeRuntime = null;
    },
  };

  activeRuntime = handle;
  return handle;
}
