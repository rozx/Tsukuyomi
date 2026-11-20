import { watch } from 'vue';
import { defineBoot } from '#q-app/wrappers';
import { recordToastInHistory } from 'src/composables/useToastHistory';
import { translateText } from 'src/i18n/translate';
import { startAgentMcpRuntime } from 'src/services/agent-mcp/runtime';
import { useAgentMcpStore } from 'src/stores/agent-mcp';
import { useSettingsStore } from 'src/stores/settings';
import { isElectron } from 'src/utils/platform';
import { getExternalChannelDisplayName } from 'src/utils/translation-model-label';

interface AgentMcpBootDeps {
  app: {
    config: {
      globalProperties: {
        $toast?: {
          add: (msg: { severity: string; summary: string; detail?: string; life?: number }) => void;
        };
      };
    };
  };
  router?:
    | {
        push: (path: string) => unknown;
      }
    | undefined;
}

export async function initAgentMcpBoot({ app, router }: AgentMcpBootDeps): Promise<() => void> {
  const settingsStore = useSettingsStore();
  const agentMcpStore = useAgentMcpStore();

  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
  const electronMode = isElectron();
  const handle = await startAgentMcpRuntime({
    isElectronEnv: electronMode,
    navigate: async (path: string) => {
      await router?.push(path);
    },
    onRecordActivity: (entry) => {
      agentMcpStore.recordActivity(entry);
    },
    onDesktopStatusChange: (status) => {
      agentMcpStore.setDesktopServerStatus(status);
    },
    onWebMcpStatusChange: (status) => {
      agentMcpStore.setWebMcpStatus(status);
    },
    onWebMcpRelayStateChange: (state) => {
      agentMcpStore.setWebMcpRelayState(state);
    },
    onWriteNotify: ({ channel, toolName }) => {
      const channelLabel = getExternalChannelDisplayName(channel);
      const summary = translateText(settingsStore.uiLocale, 'agentMcp.notify.writeTitle');
      const detail = translateText(settingsStore.uiLocale, 'agentMcp.notify.writeDetail', {
        channel: channelLabel,
        tool: toolName,
      });
      const message = { severity: 'info', summary, detail, life: 3000 } as const;
      recordToastInHistory(message);
      app.config.globalProperties.$toast?.add(message);
    },
  });

  // Vue 响应式监听放在 boot 层（而非 services 层），权限或 WebMCP 开关变更时同步注册集合
  const stopWatch = watch(
    () => [settingsStore.agentMcp.webMcpEnabled, settingsStore.agentMcp.permissionMode] as const,
    () => {
      if (!electronMode) {
        void handle.syncNow();
      }
    },
  );

  return () => {
    stopWatch();
    handle.dispose();
  };
}

export default defineBoot(({ app, router }) => {
  void initAgentMcpBoot({ app, router })
    .then((dispose) => {
      if (import.meta.hot) {
        import.meta.hot.dispose(dispose);
      }
    })
    .catch((error: unknown) => {
      console.warn('[agent-mcp] 初始化失败:', error);
    });
});
