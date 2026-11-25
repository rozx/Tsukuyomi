import type {
  RecordAgentMcpActivityInput,
  WebMcpRelayLinkStatus,
  WebMcpRelayState,
  WebMcpRuntimeStatus,
} from 'src/models/agent-mcp';
import type { DesktopMcpAPI, DesktopMcpServerStatus } from 'src/models/desktop-mcp';
import { useSettingsStore } from 'src/stores/settings';
import { isElectron } from 'src/utils/platform';
import { configureAgentMcpKernelHooks, getAgentMcpKernel } from './index';
import { createDesktopMcpBridge, type DesktopMcpBridge } from './desktop-bridge';
import type { AgentMcpKernel } from './kernel';
import { createWebMcpAdapter, type WebMcpAdapter, type WebMcpEnvLike } from './webmcp-adapter';
import { createRelayLinkMonitor, type RelayLinkMonitor } from './relay-monitor';
import {
  createWebMcpRelayBridge,
  wakeWebMcpRelayWidget,
  type WebMcpRelayBridge,
} from './webmcp-relay';
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
  /**
   * 留意本机中继是否在运行、并在它出现时叫醒中继组件的监视。缺省时随默认的中继桥接一起创建；
   * 传 null 或没有中继桥接时不监视。
   */
  relayLinkMonitor?: RelayLinkMonitor | null;
  navigate?: (path: string) => Promise<void> | void;
  /** 用户当前所在的应用内路径，供 get_app_context 说明用户在哪个页面 */
  getCurrentPath?: () => string | null;
  onWriteNotify?: (info: AgentMcpWriteNotification) => void;
  onRecordActivity?: (entry: RecordAgentMcpActivityInput) => void;
  onDesktopStatusChange?: (status: DesktopMcpServerStatus) => void;
  onWebMcpStatusChange?: (status: WebMcpRuntimeStatus) => void;
  /** 浏览器端本地中继接通状态变化（含接不上的原因），用于界面提示 */
  onWebMcpRelayStateChange?: (state: WebMcpRelayState) => void;
  /** 本页与本机中继的连接情况变化；停止监视时为 null */
  onWebMcpRelayLinkChange?: (status: WebMcpRelayLinkStatus | null) => void;
}

export interface AgentMcpRuntimeHandle {
  syncNow: () => Promise<void>;
  dispose: () => void;
}

let activeRuntime: AgentMcpRuntimeHandle | null = null;
let activeDesktopBridge: DesktopMcpBridge | null = null;
let activeWebMcpAdapter: WebMcpAdapter | null = null;
let activeRelayLinkMonitor: RelayLinkMonitor | null = null;

export function getActiveDesktopMcpBridge(): DesktopMcpBridge | null {
  return activeDesktopBridge;
}

export function getActiveWebMcpAdapter(): WebMcpAdapter | null {
  return activeWebMcpAdapter;
}

export function getActiveRelayLinkMonitor(): RelayLinkMonitor | null {
  return activeRelayLinkMonitor;
}

function createDefaultRelayLinkMonitor(
  onChange: StartAgentMcpRuntimeOptions['onWebMcpRelayLinkChange'],
): RelayLinkMonitor {
  return createRelayLinkMonitor({
    origin: window.location.origin,
    // 存储被浏览器禁用时读取会抛错，由探测时的 try 兜住，这里不提前访问
    storage: { getItem: (key) => window.sessionStorage.getItem(key) },
    wake: wakeWebMcpRelayWidget,
    ...(onChange ? { onChange } : {}),
  });
}

/** 浏览器端的通道：WebMCP 适配器、本地中继桥接，以及留意中继是否在运行的监视 */
interface WebChannels {
  adapter: WebMcpAdapter;
  relay: WebMcpRelayBridge | null;
  monitor: RelayLinkMonitor | null;
}

function createWebChannels(
  options: StartAgentMcpRuntimeOptions,
  kernel: AgentMcpKernel,
): WebChannels {
  // 测试注入模拟宿主时没有真实的中继，除非明确传入否则不创建、也不监视
  const usesDefaultRelay = options.webMcpRelay === undefined && !options.webMcpEnv;
  const defaultMonitor = usesDefaultRelay
    ? createDefaultRelayLinkMonitor(options.onWebMcpRelayLinkChange)
    : null;
  return {
    adapter: createWebMcpAdapter({
      kernel,
      ...(options.onWebMcpStatusChange ? { onStatusChange: options.onWebMcpStatusChange } : {}),
      ...(options.webMcpEnv ? { env: options.webMcpEnv } : {}),
    }),
    relay:
      options.webMcpRelay !== undefined
        ? options.webMcpRelay
        : usesDefaultRelay
          ? createWebMcpRelayBridge()
          : null,
    monitor: options.relayLinkMonitor !== undefined ? options.relayLinkMonitor : defaultMonitor,
  };
}

/**
 * 按开关同步浏览器端通道。开启时先让 document.modelContext 存在并接上本机中继，再注册工具；
 * 关闭时先注销工具再断开中继。
 */
async function syncWebChannels(
  channels: WebChannels,
  options: StartAgentMcpRuntimeOptions,
  state: { isEnabled: () => boolean; isDisposed: () => boolean },
): Promise<void> {
  const { adapter, relay, monitor } = channels;
  if (state.isEnabled()) {
    const relayState = await relay?.enable();
    if (state.isDisposed()) return;
    // 接通中继需要时间：期间开关被关掉的话不注册工具，按关闭处理
    if (state.isEnabled()) {
      if (relayState) options.onWebMcpRelayStateChange?.(relayState);
      await adapter.sync(true);
      // 中继多半比页面晚启动：接通后持续留意它，出现时叫醒中继组件；在哪个页面都一样
      if (relayState === 'enabled') monitor?.start();
      else monitor?.stop();
      return;
    }
  }
  monitor?.stop();
  await adapter.sync(false);
  relay?.disable();
  if (relay) options.onWebMcpRelayStateChange?.('idle');
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
  if (electronMode && desktopApi) {
    desktopBridge = createDesktopMcpBridge({
      api: desktopApi,
      kernel,
      ...(options.onDesktopStatusChange ? { onStatusChange: options.onDesktopStatusChange } : {}),
    });
    desktopBridge.mount();
  }
  // Electron 渲染进程不注册 WebMCP；仅浏览器端初始化 WebMCP 适配器
  const web = electronMode ? null : createWebChannels(options, kernel);

  activeDesktopBridge = desktopBridge;
  activeWebMcpAdapter = web?.adapter ?? null;
  activeRelayLinkMonitor = web?.monitor ?? null;

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
    if (disposed || !web) return;
    await syncWebChannels(web, options, {
      isEnabled: () => settingsStore.agentMcp.webMcpEnabled,
      isDisposed: () => disposed,
    });
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
    void web?.adapter.unregisterAll();
    web?.monitor?.stop();
    web?.relay?.disable();
    if (web && activeRelayLinkMonitor === web.monitor) activeRelayLinkMonitor = null;
    if (activeDesktopBridge === desktopBridge) activeDesktopBridge = null;
    if (web && activeWebMcpAdapter === web.adapter) activeWebMcpAdapter = null;
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
