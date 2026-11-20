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
import { ALL_AGENT_MCP_TOOLS, getAgentMcpKernel } from 'src/services/agent-mcp';
import { buildAgentQuickStartGuide } from 'src/services/agent-mcp/agent-quick-start';
import { isToolAllowedByPermission } from 'src/services/agent-mcp/kernel';
import { getActiveDesktopMcpBridge, getActiveWebMcpAdapter } from 'src/services/agent-mcp/runtime';
import type {
  AgentMcpPromptDescriptor,
  AgentMcpToolCategory,
  AgentMcpToolDescriptor,
} from 'src/services/agent-mcp/types';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { useSettingsStore } from 'src/stores/settings';
import { isElectron } from 'src/utils/platform';

export type AgentMcpConnectTab = 'claude-code' | 'pi' | 'antigravity';

export interface LocalizedAgentMcpToolDescriptor extends AgentMcpToolDescriptor {
  displayDescription: string;
}

export interface LocalizedAgentMcpPromptDescriptor extends AgentMcpPromptDescriptor {
  displayDescription: string;
}

export interface AgentMcpToolGroup {
  category: AgentMcpToolCategory;
  label: string;
  tools: LocalizedAgentMcpToolDescriptor[];
}

export interface AgentMcpPermissionOption {
  value: AgentMcpPermissionMode;
  label: string;
  description: string;
  /** 该权限下当前通道开放的工具数量 */
  toolCount: number;
  recommended: boolean;
  danger: boolean;
}

const TOOL_CATEGORY_META: ReadonlyArray<{ category: AgentMcpToolCategory; labelKey: MessageKey }> =
  [
    { category: 'context', labelKey: 'agentMcp.catalog.categoryContext' },
    { category: 'library', labelKey: 'agentMcp.catalog.categoryLibrary' },
    { category: 'translation', labelKey: 'agentMcp.catalog.categoryTranslation' },
    { category: 'worldbuilding', labelKey: 'agentMcp.catalog.categoryWorldbuilding' },
  ];

const PERMISSION_META: ReadonlyArray<{
  value: AgentMcpPermissionMode;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    value: 'read_only',
    labelKey: 'agentMcp.permission.readOnly',
    descriptionKey: 'agentMcp.permission.readOnlyDesc',
  },
  {
    value: 'translate_and_edit',
    labelKey: 'agentMcp.permission.translateEdit',
    descriptionKey: 'agentMcp.permission.translateEditDesc',
  },
  {
    value: 'full',
    labelKey: 'agentMcp.permission.full',
    descriptionKey: 'agentMcp.permission.fullDesc',
  },
];

const SNIPPET_PLACEMENT_KEYS: Record<AgentMcpConnectTab, MessageKey> = {
  'claude-code': 'agentMcp.steps.placeClaudeCode',
  pi: 'agentMcp.steps.placePi',
  antigravity: 'agentMcp.steps.placeAntigravity',
};

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
  /** 当前通道已可用：桌面端服务运行中，或浏览器端工具已注册 */
  connectionReady: ComputedRef<boolean>;
  /** 本次会话是否已收到过外部调用 */
  firstCallReceived: ComputedRef<boolean>;
  endpointUrl: ComputedRef<string>;
  portDraft: Ref<number>;
  tokenRevealed: Ref<boolean>;
  maskedToken: ComputedRef<string>;
  activeConnectTab: Ref<AgentMcpConnectTab>;
  connectTabs: ComputedRef<AgentMcpConnectTab[]>;
  activeSnippet: ComputedRef<string>;
  /** 当前客户端的配置片段该放在哪里、如何确认已连接 */
  snippetPlacementHint: ComputedRef<string>;
  /** 给外部 Agent 的快速上手指南（Markdown），可直接粘贴或放进其项目说明 */
  quickStartGuide: ComputedRef<string>;
  exposedTools: ComputedRef<LocalizedAgentMcpToolDescriptor[]>;
  toolGroups: ComputedRef<AgentMcpToolGroup[]>;
  expandedToolCategories: Ref<string[]>;
  permissionOptions: ComputedRef<AgentMcpPermissionOption[]>;
  /** 已选择「完全控制」但尚未确认 */
  pendingFullPermission: Ref<boolean>;
  /** 已点击重新生成令牌但尚未确认 */
  regenerateArmed: Ref<boolean>;
  prompts: ComputedRef<LocalizedAgentMcpPromptDescriptor[]>;
  activities: ComputedRef<AgentMcpActivityEntry[]>;
  toggleDesktopServer: (enabled: boolean) => Promise<void>;
  applyPort: () => Promise<void>;
  requestRegenerateToken: () => void;
  cancelRegenerateToken: () => void;
  regenerateToken: () => Promise<string>;
  copyToken: () => Promise<void>;
  copyEndpoint: () => Promise<void>;
  copyActiveSnippet: () => Promise<void>;
  copyQuickStartGuide: () => Promise<void>;
  toggleToolCategory: (category: string) => void;
  toggleWebMcp: (enabled: boolean) => Promise<void>;
  /** 选择权限模式；「完全控制」需再调用 confirmFullPermission 才生效 */
  requestPermissionMode: (mode: AgentMcpPermissionMode) => Promise<void>;
  confirmFullPermission: () => Promise<void>;
  cancelFullPermission: () => void;
  setDefaultWriteMode: (mode: AgentMcpWriteMode) => Promise<void>;
  setNotifyOnWrite: (enabled: boolean) => Promise<void>;
  clearActivities: () => void;
}

const AGENT_MCP_PAGE_KEY: InjectionKey<AgentMcpPageContext> = Symbol('agent-mcp-page');

function translateOrFallback(locale: AppLocale, key: string, fallback: string): string {
  const translated = translateText(locale, key as MessageKey);
  return translated === key ? fallback : translated;
}

function buildClientSnippet(tab: AgentMcpConnectTab, endpointUrl: string, token: string): string {
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

  const connectTabs = computed<AgentMcpConnectTab[]>(() =>
    isElectronEnv.value ? ['claude-code', 'pi', 'antigravity'] : [],
  );
  const activeConnectTab = ref<AgentMcpConnectTab>('claude-code');

  const maskedToken = computed(() => {
    const token = settings.value.desktopAuthToken;
    if (!token) return '—';
    if (tokenRevealed.value) return token;
    if (token.length <= 12) return '••••••••••••';
    return `${token.slice(0, 6)}••••••••••••••••${token.slice(-6)}`;
  });

  const activeSnippet = computed(() =>
    buildClientSnippet(activeConnectTab.value, endpointUrl.value, settings.value.desktopAuthToken),
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

  const toolGroups = computed<AgentMcpToolGroup[]>(() => {
    const locale = settingsStore.uiLocale;
    return TOOL_CATEGORY_META.map(({ category, labelKey }) => ({
      category,
      label: translateText(locale, labelKey),
      tools: exposedTools.value.filter((tool) => tool.category === category),
    })).filter((group) => group.tools.length > 0);
  });

  const expandedToolCategories = ref<string[]>([]);
  const toggleToolCategory = (category: string): void => {
    expandedToolCategories.value = expandedToolCategories.value.includes(category)
      ? expandedToolCategories.value.filter((item) => item !== category)
      : [...expandedToolCategories.value, category];
  };

  const permissionOptions = computed<AgentMcpPermissionOption[]>(() => {
    const locale = settingsStore.uiLocale;
    const channel = activeChannel.value;
    return PERMISSION_META.map(({ value, labelKey, descriptionKey }) => ({
      value,
      label: translateText(locale, labelKey),
      description: translateText(locale, descriptionKey),
      toolCount: ALL_AGENT_MCP_TOOLS.filter(
        (tool) =>
          (!tool.webMcpOnly || channel === 'webmcp') &&
          isToolAllowedByPermission(tool.permission, value),
      ).length,
      recommended: value === 'translate_and_edit',
      danger: value === 'full',
    }));
  });

  const connectionReady = computed(() =>
    isElectronEnv.value
      ? desktopServerStatus.value.state === 'running'
      : webMcpStatus.value.registered,
  );

  const snippetPlacementHint = computed(() =>
    translateText(settingsStore.uiLocale, SNIPPET_PLACEMENT_KEYS[activeConnectTab.value]),
  );

  const quickStartGuide = computed(() =>
    buildAgentQuickStartGuide({ locale: settingsStore.uiLocale, channel: activeChannel.value }),
  );

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
  const firstCallReceived = computed(() => activities.value.length > 0);

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

  const regenerateArmed = ref(false);
  const requestRegenerateToken = (): void => {
    regenerateArmed.value = true;
  };
  const cancelRegenerateToken = (): void => {
    regenerateArmed.value = false;
  };

  const regenerateToken = async (): Promise<string> => {
    regenerateArmed.value = false;
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
    // 服务没在运行时配置片段连不上，直接提示而不是让用户复制一份无效配置
    if (!connectionReady.value) {
      toast.add({
        severity: 'warn',
        summary: translateText(settingsStore.uiLocale, 'agentMcp.notify.serverNotRunning'),
        life: 3000,
      });
      return;
    }
    await copyText(activeSnippet.value);
  };

  const copyQuickStartGuide = async (): Promise<void> => {
    await copyText(quickStartGuide.value);
  };

  const toggleWebMcp = async (enabled: boolean): Promise<void> => {
    await settingsStore.updateAgentMcpSettings({ webMcpEnabled: enabled });
  };

  const pendingFullPermission = ref(false);
  const requestPermissionMode = async (mode: AgentMcpPermissionMode): Promise<void> => {
    if (mode === 'full' && settings.value.permissionMode !== 'full') {
      pendingFullPermission.value = true;
      return;
    }
    pendingFullPermission.value = false;
    await settingsStore.updateAgentMcpSettings({ permissionMode: mode });
  };
  const confirmFullPermission = async (): Promise<void> => {
    pendingFullPermission.value = false;
    await settingsStore.updateAgentMcpSettings({ permissionMode: 'full' });
  };
  const cancelFullPermission = (): void => {
    pendingFullPermission.value = false;
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
    connectionReady,
    firstCallReceived,
    endpointUrl,
    portDraft,
    tokenRevealed,
    maskedToken,
    activeConnectTab,
    connectTabs,
    activeSnippet,
    snippetPlacementHint,
    quickStartGuide,
    exposedTools,
    toolGroups,
    expandedToolCategories,
    permissionOptions,
    pendingFullPermission,
    regenerateArmed,
    prompts,
    activities,
    toggleDesktopServer,
    applyPort,
    requestRegenerateToken,
    cancelRegenerateToken,
    regenerateToken,
    copyToken,
    copyEndpoint,
    copyActiveSnippet,
    copyQuickStartGuide,
    toggleToolCategory,
    toggleWebMcp,
    requestPermissionMode,
    confirmFullPermission,
    cancelFullPermission,
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
