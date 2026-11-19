import {
  computed,
  inject,
  onMounted,
  provide,
  ref,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue';
import type {
  AgentMcpActivityEntry,
  ExternalAgentChannel,
  WebMcpAvailability,
  WebMcpRuntimeStatus,
} from 'src/models/agent-mcp';
import type { DesktopMcpServerState, DesktopMcpServerStatus } from 'src/models/desktop-mcp';
import type { AppLocale } from 'src/models/locale';
import type {
  AgentMcpPermissionMode,
  AgentMcpSettings,
  AgentMcpWriteMode,
} from 'src/models/settings';
import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { getAgentMcpKernel } from 'src/services/agent-mcp';
import { getActiveDesktopMcpBridge, getActiveWebMcpAdapter } from 'src/services/agent-mcp/runtime';
import type {
  AgentMcpPromptDescriptor,
  AgentMcpToolDescriptor,
} from 'src/services/agent-mcp/types';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { useSettingsStore } from 'src/stores/settings';
import { isElectron } from 'src/utils/platform';

export type AgentMcpConnectTab = 'claude-code' | 'pi' | 'antigravity' | 'webmcp';

export interface LocalizedAgentMcpToolDescriptor extends AgentMcpToolDescriptor {
  displayDescription: string;
}

export interface LocalizedAgentMcpPromptDescriptor extends AgentMcpPromptDescriptor {
  displayDescription: string;
}

export interface AgentMcpMetricItem {
  label: string;
  value: string | number;
}

const DESKTOP_STATUS_META: Record<
  DesktopMcpServerState,
  { labelKey: MessageKey; severity: 'success' | 'info' | 'danger' | 'secondary' }
> = {
  running: { labelKey: 'agentMcp.status.running', severity: 'success' },
  starting: { labelKey: 'agentMcp.status.starting', severity: 'info' },
  error: { labelKey: 'agentMcp.status.error', severity: 'danger' },
  stopped: { labelKey: 'agentMcp.status.stopped', severity: 'secondary' },
};

const WEB_AVAILABILITY_META: Record<
  WebMcpAvailability,
  { labelKey: MessageKey; severity: 'success' | 'info' | 'secondary' }
> = {
  'native-document': { labelKey: 'agentMcp.status.nativeDocument', severity: 'success' },
  'native-navigator': { labelKey: 'agentMcp.status.nativeNavigator', severity: 'info' },
  unavailable: { labelKey: 'agentMcp.status.unavailable', severity: 'secondary' },
};

export interface AgentMcpPageContext {
  isElectronEnv: ComputedRef<boolean>;
  settings: ComputedRef<AgentMcpSettings>;
  desktopServerStatus: ComputedRef<DesktopMcpServerStatus>;
  webMcpStatus: ComputedRef<WebMcpRuntimeStatus>;
  runtimeStatusLabel: ComputedRef<string>;
  runtimeStatusSeverity: ComputedRef<'success' | 'info' | 'danger' | 'secondary'>;
  webAvailabilityLabel: ComputedRef<string>;
  webAvailabilitySeverity: ComputedRef<'success' | 'info' | 'secondary'>;
  metrics: ComputedRef<AgentMcpMetricItem[]>;
  endpointUrl: ComputedRef<string>;
  portDraft: Ref<number>;
  tokenRevealed: Ref<boolean>;
  maskedToken: ComputedRef<string>;
  activeConnectTab: Ref<AgentMcpConnectTab>;
  connectTabs: ComputedRef<AgentMcpConnectTab[]>;
  activeSnippet: ComputedRef<string>;
  toolSearchQuery: Ref<string>;
  exposedTools: ComputedRef<LocalizedAgentMcpToolDescriptor[]>;
  filteredTools: ComputedRef<LocalizedAgentMcpToolDescriptor[]>;
  prompts: ComputedRef<LocalizedAgentMcpPromptDescriptor[]>;
  activities: ComputedRef<AgentMcpActivityEntry[]>;
  toggleDesktopServer: (enabled: boolean) => Promise<void>;
  applyPort: () => Promise<void>;
  regenerateToken: () => Promise<string>;
  copyToken: () => Promise<void>;
  copyEndpoint: () => Promise<void>;
  copyActiveSnippet: () => Promise<void>;
  toggleWebMcp: (enabled: boolean) => Promise<void>;
  setPermissionMode: (mode: AgentMcpPermissionMode) => Promise<void>;
  setDefaultWriteMode: (mode: AgentMcpWriteMode) => Promise<void>;
  setNotifyOnWrite: (enabled: boolean) => Promise<void>;
  clearActivities: () => void;
}

const AGENT_MCP_PAGE_KEY: InjectionKey<AgentMcpPageContext> = Symbol('agent-mcp-page');

function translateOrFallback(locale: AppLocale, key: string, fallback: string): string {
  const translated = translateText(locale, key as MessageKey);
  return translated === key ? fallback : translated;
}

function buildClientSnippet(
  tab: AgentMcpConnectTab,
  endpointUrl: string,
  token: string,
  locale: AppLocale,
): string {
  const displayToken = token || '<YOUR_BEARER_TOKEN>';
  switch (tab) {
    case 'claude-code':
      return [
        `claude mcp add --transport http tsukuyomi ${endpointUrl} \\`,
        `  --header "Authorization: Bearer ${displayToken}"`,
      ].join('\n');

    case 'pi':
      return JSON.stringify(
        {
          mcpServers: {
            tsukuyomi: {
              url: endpointUrl,
              headers: {
                Authorization: `Bearer ${displayToken}`,
              },
            },
          },
        },
        null,
        2,
      );

    case 'antigravity':
      return JSON.stringify(
        {
          mcpServers: {
            tsukuyomi: {
              serverUrl: endpointUrl,
              headers: {
                Authorization: `Bearer ${displayToken}`,
              },
            },
          },
        },
        null,
        2,
      );

    case 'webmcp':
      return translateText(locale, 'agentMcp.quickConnect.webSnippet');
  }
}

export function createAgentMcpPageContext(): AgentMcpPageContext {
  const settingsStore = useSettingsStore();
  const agentMcpStore = useAgentMcpStore();
  const toast = useToastWithHistory();
  const kernel = getAgentMcpKernel();

  const isElectronEnv = computed(() => isElectron());
  const settings = computed(() => settingsStore.agentMcp);
  const desktopServerStatus = computed(() => agentMcpStore.desktopServerStatus);
  const webMcpStatus = computed(() => agentMcpStore.webMcpStatus);

  const desktopStatusMeta = computed(
    () => DESKTOP_STATUS_META[desktopServerStatus.value.state] ?? DESKTOP_STATUS_META.stopped,
  );
  const webAvailabilityMeta = computed(
    () =>
      WEB_AVAILABILITY_META[webMcpStatus.value.availability] ?? WEB_AVAILABILITY_META.unavailable,
  );

  const runtimeStatusLabel = computed(() => {
    const locale = settingsStore.uiLocale;
    if (isElectronEnv.value) {
      return translateText(locale, desktopStatusMeta.value.labelKey);
    }
    return webMcpStatus.value.registered
      ? translateText(locale, 'agentMcp.status.registered')
      : translateText(locale, 'agentMcp.status.unregistered');
  });

  const runtimeStatusSeverity = computed<'success' | 'info' | 'danger' | 'secondary'>(() => {
    if (isElectronEnv.value) {
      return desktopStatusMeta.value.severity;
    }
    return webMcpStatus.value.registered ? 'success' : 'secondary';
  });

  const webAvailabilityLabel = computed(() =>
    translateText(settingsStore.uiLocale, webAvailabilityMeta.value.labelKey),
  );
  const webAvailabilitySeverity = computed(() => webAvailabilityMeta.value.severity);

  const activePort = computed(() => desktopServerStatus.value.port ?? settings.value.desktopPort);
  const endpointUrl = computed(() => `http://127.0.0.1:${activePort.value}/mcp`);

  const portDraft = ref<number>(settings.value.desktopPort);
  const tokenRevealed = ref(false);
  const toolSearchQuery = ref('');

  const connectTabs = computed<AgentMcpConnectTab[]>(() =>
    isElectronEnv.value ? ['claude-code', 'pi', 'antigravity'] : ['webmcp'],
  );
  const activeConnectTab = ref<AgentMcpConnectTab>(isElectronEnv.value ? 'claude-code' : 'webmcp');

  const maskedToken = computed(() => {
    const token = settings.value.desktopAuthToken;
    if (!token) return '—';
    if (tokenRevealed.value) return token;
    if (token.length <= 12) return '••••••••••••';
    return `${token.slice(0, 6)}••••••••••••••••${token.slice(-6)}`;
  });

  const activeSnippet = computed(() =>
    buildClientSnippet(
      activeConnectTab.value,
      endpointUrl.value,
      settings.value.desktopAuthToken,
      settingsStore.uiLocale,
    ),
  );

  const activeChannel = computed<ExternalAgentChannel>(() =>
    isElectronEnv.value ? 'desktop-mcp' : 'webmcp',
  );

  const exposedTools = computed<LocalizedAgentMcpToolDescriptor[]>(() => {
    // 依赖 permissionMode 与 uiLocale 以在切换权限或语言时响应式重算
    void settings.value.permissionMode;
    const locale = settingsStore.uiLocale;
    return kernel.listTools(activeChannel.value).map((tool) => ({
      ...tool,
      displayDescription: translateOrFallback(
        locale,
        `agentMcp.tools.${tool.name}`,
        tool.description,
      ),
    }));
  });

  const filteredTools = computed(() => {
    const q = toolSearchQuery.value.trim().toLowerCase();
    if (!q) return exposedTools.value;
    return exposedTools.value.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.displayDescription.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q),
    );
  });

  const prompts = computed<LocalizedAgentMcpPromptDescriptor[]>(() => {
    const locale = settingsStore.uiLocale;
    return kernel.listPrompts().map((prompt) => ({
      ...prompt,
      displayDescription: translateOrFallback(
        locale,
        `agentMcp.prompts.${prompt.name}`,
        prompt.description,
      ),
    }));
  });
  const activities = computed(() => agentMcpStore.activities);

  const metrics = computed<AgentMcpMetricItem[]>(() => {
    const locale = settingsStore.uiLocale;
    return [
      {
        label: translateText(locale, 'agentMcp.metrics.channel'),
        value: isElectronEnv.value
          ? translateText(locale, 'agentMcp.metrics.channelDesktop')
          : translateText(locale, 'agentMcp.metrics.channelWeb'),
      },
      {
        label: translateText(locale, 'agentMcp.metrics.status'),
        value: runtimeStatusLabel.value,
      },
      {
        label: translateText(locale, 'agentMcp.metrics.exposedTools'),
        value: exposedTools.value.length,
      },
      {
        label: translateText(locale, 'agentMcp.metrics.recentCalls'),
        value: activities.value.length,
      },
    ];
  });

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.add({
        severity: 'success',
        summary: translateText(settingsStore.uiLocale, 'agentMcp.notify.copied'),
        life: 2200,
      });
    } catch {
      toast.add({
        severity: 'warn',
        summary: translateText(settingsStore.uiLocale, 'agentMcp.notify.copyFailed'),
        life: 3000,
      });
    }
  };

  const handleDesktopStartError = async (status: DesktopMcpServerStatus): Promise<boolean> => {
    if (status.state !== 'error') return false;
    await settingsStore.updateAgentMcpSettings({ desktopServerEnabled: false });
    toast.add({
      severity: 'error',
      summary: translateText(settingsStore.uiLocale, 'agentMcp.notify.serverStartFailed'),
      detail: status.error ?? '',
      life: 4500,
    });
    return true;
  };

  const toggleDesktopServer = async (enabled: boolean): Promise<void> => {
    const bridge = getActiveDesktopMcpBridge();
    if (enabled) {
      const startConfig = await settingsStore.getDesktopMcpStartConfig();
      await settingsStore.updateAgentMcpSettings({ desktopServerEnabled: true });
      if (bridge) {
        const nextStatus = await bridge.start(startConfig);
        await handleDesktopStartError(nextStatus);
      }
    } else {
      await settingsStore.updateAgentMcpSettings({ desktopServerEnabled: false });
      await bridge?.stop();
    }
  };

  const applyPort = async (): Promise<void> => {
    const updated = await settingsStore.updateAgentMcpSettings({ desktopPort: portDraft.value });
    portDraft.value = updated.desktopPort;
    const bridge = getActiveDesktopMcpBridge();
    if (bridge && updated.desktopServerEnabled) {
      const nextStatus = await bridge.updateConfig(await settingsStore.getDesktopMcpStartConfig());
      if (await handleDesktopStartError(nextStatus)) {
        return;
      }
    }
    toast.add({
      severity: 'success',
      summary: translateText(settingsStore.uiLocale, 'agentMcp.notify.portSaved', {
        port: updated.desktopPort,
      }),
      life: 2400,
    });
  };

  const regenerateToken = async (): Promise<string> => {
    const nextToken = await settingsStore.regenerateAgentMcpAuthToken();
    const bridge = getActiveDesktopMcpBridge();
    if (bridge) {
      await bridge.updateConfig({
        port: settingsStore.agentMcp.desktopPort,
        authToken: nextToken,
      });
    }
    toast.add({
      severity: 'info',
      summary: translateText(settingsStore.uiLocale, 'agentMcp.notify.tokenRegenerated'),
      life: 3200,
    });
    return nextToken;
  };

  const copyToken = async (): Promise<void> => {
    const token = await settingsStore.ensureAgentMcpAuthToken();
    await copyText(token);
  };

  const copyEndpoint = async (): Promise<void> => {
    await copyText(endpointUrl.value);
  };

  const copyActiveSnippet = async (): Promise<void> => {
    if (isElectronEnv.value && !settings.value.desktopAuthToken) {
      await settingsStore.ensureAgentMcpAuthToken();
    }
    await copyText(activeSnippet.value);
  };

  const toggleWebMcp = async (enabled: boolean): Promise<void> => {
    await settingsStore.updateAgentMcpSettings({ webMcpEnabled: enabled });
  };

  const setPermissionMode = async (mode: AgentMcpPermissionMode): Promise<void> => {
    await settingsStore.updateAgentMcpSettings({ permissionMode: mode });
  };

  const setDefaultWriteMode = async (mode: AgentMcpWriteMode): Promise<void> => {
    await settingsStore.updateAgentMcpSettings({ defaultWriteMode: mode });
  };

  const setNotifyOnWrite = async (enabled: boolean): Promise<void> => {
    await settingsStore.updateAgentMcpSettings({ notifyOnWrite: enabled });
  };

  const clearActivities = (): void => {
    agentMcpStore.clearActivities();
  };

  onMounted(() => {
    portDraft.value = settings.value.desktopPort;
    if (isElectronEnv.value) {
      void settingsStore.ensureAgentMcpAuthToken();
      void getActiveDesktopMcpBridge()?.syncStatus();
    } else {
      getActiveWebMcpAdapter()?.refreshAvailability();
    }
  });

  return {
    isElectronEnv,
    settings,
    desktopServerStatus,
    webMcpStatus,
    runtimeStatusLabel,
    runtimeStatusSeverity,
    webAvailabilityLabel,
    webAvailabilitySeverity,
    metrics,
    endpointUrl,
    portDraft,
    tokenRevealed,
    maskedToken,
    activeConnectTab,
    connectTabs,
    activeSnippet,
    toolSearchQuery,
    exposedTools,
    filteredTools,
    prompts,
    activities,
    toggleDesktopServer,
    applyPort,
    regenerateToken,
    copyToken,
    copyEndpoint,
    copyActiveSnippet,
    toggleWebMcp,
    setPermissionMode,
    setDefaultWriteMode,
    setNotifyOnWrite,
    clearActivities,
  };
}

export function provideAgentMcpPage(): AgentMcpPageContext {
  const ctx = createAgentMcpPageContext();
  provide(AGENT_MCP_PAGE_KEY, ctx);
  return ctx;
}

export function injectAgentMcpPage(): AgentMcpPageContext {
  const ctx = inject(AGENT_MCP_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectAgentMcpPage() called outside AgentMcpPage dispatcher — ensure the variant is mounted by AgentMcpPage.vue.',
    );
  }
  return ctx;
}
