<template>
  <AgentMcpPanel>
    <ol class="steps">
      <!-- 第一步：开启服务（桌面端本地 MCP / 浏览器端 WebMCP） -->
      <li class="step">
        <span class="step-index" :class="{ 'step-index--done': ctx.connectionReady.value }">
          <i v-if="ctx.connectionReady.value" class="pi pi-check" aria-hidden="true" />
          <template v-else>1</template>
        </span>
        <div class="step-body">
          <div class="amcp-row">
            <div class="amcp-panel-copy">
              <h3 class="step-title">
                {{
                  ctx.isElectronEnv.value
                    ? t('agentMcp.steps.desktopEnableTitle')
                    : t('agentMcp.steps.webEnableTitle')
                }}
              </h3>
              <p class="amcp-hint">
                {{
                  ctx.isElectronEnv.value
                    ? t('agentMcp.steps.desktopEnableHint')
                    : t('agentMcp.steps.webEnableHint')
                }}
              </p>
            </div>
            <div class="amcp-inline">
              <Tag
                :value="ctx.runtimeStatusLabel.value"
                :severity="ctx.runtimeStatusSeverity.value"
              />
              <ToggleSwitch
                v-if="ctx.isElectronEnv.value"
                :model-value="ctx.settings.value.desktopServerEnabled"
                :aria-label="t('agentMcp.steps.enableDesktop')"
                @update:model-value="ctx.toggleDesktopServer"
              />
              <ToggleSwitch
                v-else
                :model-value="ctx.settings.value.webMcpEnabled"
                :aria-label="t('agentMcp.steps.enableWebMcp')"
                @update:model-value="ctx.toggleWebMcp"
              />
            </div>
          </div>

          <template v-if="ctx.isElectronEnv.value">
            <div v-if="ctx.desktopServerStatus.value.error" class="amcp-alert amcp-alert--error">
              <i class="pi pi-exclamation-triangle" aria-hidden="true" />
              <span>{{ ctx.desktopServerStatus.value.error }}</span>
            </div>
            <div v-if="ctx.connectionReady.value" class="amcp-field">
              <span class="amcp-label">{{ t('agentMcp.steps.endpoint') }}</span>
              <div class="amcp-inline">
                <code class="amcp-code">{{ ctx.endpointUrl.value }}</code>
                <Button
                  icon="pi pi-copy"
                  text
                  size="small"
                  :aria-label="t('agentMcp.steps.copyEndpoint')"
                  :title="t('agentMcp.steps.copyEndpoint')"
                  @click="ctx.copyEndpoint"
                />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="amcp-inline">
              <Tag
                :value="ctx.webAvailabilityLabel.value"
                :severity="ctx.webAvailabilitySeverity.value"
              />
            </div>
            <div
              v-if="ctx.webMcpStatus.value.availability === 'unavailable'"
              class="amcp-alert amcp-alert--info"
            >
              <i class="pi pi-info-circle" aria-hidden="true" />
              <span>{{ t('agentMcp.steps.webUnavailableHint') }}</span>
            </div>
          </template>
        </div>
      </li>

      <!-- 第二步：把配置贴到客户端（仅桌面端需要） -->
      <li v-if="ctx.connectTabs.value.length > 0" class="step">
        <span class="step-index">2</span>
        <div class="step-body">
          <div class="amcp-row">
            <div class="amcp-panel-copy">
              <h3 class="step-title">{{ t('agentMcp.steps.clientTitle') }}</h3>
              <p class="amcp-hint">
                {{
                  ctx.connectionReady.value
                    ? t('agentMcp.steps.clientHint')
                    : t('agentMcp.steps.clientLocked')
                }}
              </p>
            </div>
            <Button
              :label="t('agentMcp.steps.copySnippet')"
              icon="pi pi-copy"
              size="small"
              :disabled="!ctx.connectionReady.value"
              @click="ctx.copyActiveSnippet"
            />
          </div>
          <div class="amcp-chips" role="tablist">
            <button
              v-for="tab in ctx.connectTabs.value"
              :key="tab"
              type="button"
              role="tab"
              class="amcp-chip"
              :class="{ 'amcp-chip--active': ctx.activeConnectTab.value === tab }"
              :aria-selected="ctx.activeConnectTab.value === tab"
              @click="ctx.activeConnectTab.value = tab"
            >
              {{ tabLabel(tab) }}
            </button>
          </div>
          <pre
            class="amcp-pre"
            :class="{ 'snippet--locked': !ctx.connectionReady.value }"
          ><code>{{ ctx.activeSnippet.value }}</code></pre>
          <p class="amcp-hint">{{ ctx.snippetPlacementHint.value }}</p>
        </div>
      </li>

      <!-- 最后一步：给 Agent 一份快速上手指南 -->
      <li class="step">
        <span class="step-index">{{ ctx.connectTabs.value.length > 0 ? 3 : 2 }}</span>
        <div class="step-body">
          <div class="amcp-row">
            <div class="amcp-panel-copy">
              <h3 class="step-title">{{ t('agentMcp.steps.guideTitle') }}</h3>
              <p class="amcp-hint">{{ t('agentMcp.steps.guideHint') }}</p>
            </div>
            <Button
              :label="t('agentMcp.steps.copyGuide')"
              icon="pi pi-copy"
              size="small"
              @click="ctx.copyQuickStartGuide"
            />
          </div>
          <pre class="amcp-pre amcp-pre--wrap"><code>{{ ctx.quickStartGuide.value }}</code></pre>
        </div>
      </li>
    </ol>

    <!-- 是否已连通的反馈 -->
    <div class="link-status" :class="{ 'link-status--ok': ctx.firstCallReceived.value }">
      <i
        class="pi"
        :class="ctx.firstCallReceived.value ? 'pi-check-circle' : 'pi-clock'"
        aria-hidden="true"
      />
      <span>{{ linkStatusText }}</span>
    </div>
  </AgentMcpPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import AgentMcpPanel from 'src/components/agent-mcp/AgentMcpPanel.vue';
import {
  injectAgentMcpPage,
  type AgentMcpConnectTab,
} from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t, locale } = useI18n();
const ctx = injectAgentMcpPage();

const TAB_LABEL_KEYS: Record<AgentMcpConnectTab, string> = {
  'claude-code': 'agentMcp.steps.tabClaudeCode',
  pi: 'agentMcp.steps.tabPi',
  antigravity: 'agentMcp.steps.tabAntigravity',
};

function tabLabel(tab: AgentMcpConnectTab): string {
  return t(TAB_LABEL_KEYS[tab]);
}

const linkStatusText = computed(() => {
  const latest = ctx.activities.value[0];
  if (!latest) return t('agentMcp.steps.waitingFirstCall');
  return t('agentMcp.steps.firstCallReceived', {
    tool: latest.toolName,
    time: new Date(latest.timestamp).toLocaleTimeString(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  });
});
</script>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
}

.step-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--tsukuyomi-opacity-40);
  background: var(--tsukuyomi-opacity-14);
  color: var(--moon-50-opacity-100);
  font-size: 13px;
  font-weight: 600;
}

.step-index--done {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.5);
  color: #86efac;
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.step-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
  letter-spacing: normal;
  color: var(--moon-50-opacity-100);
}

.snippet--locked {
  opacity: 0.45;
  user-select: none;
}

.link-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-8);
  background: var(--white-opacity-3);
  font-size: 12px;
  color: var(--moon-50-opacity-70);
}

.link-status--ok {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.1);
  color: #bbf7d0;
}
</style>
