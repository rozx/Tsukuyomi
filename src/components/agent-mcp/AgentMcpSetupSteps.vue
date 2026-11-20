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
                :model-value="ctx.webMcpToggleOn.value"
                :disabled="!ctx.webMcpSupported.value"
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
            <!-- 支持时说明接口来源；不支持时只给一个结论和出路 -->
            <div v-if="ctx.webMcpSupported.value" class="amcp-inline">
              <Tag
                :value="ctx.webAvailabilityLabel.value"
                :severity="ctx.webAvailabilitySeverity.value"
              />
            </div>
            <template v-else>
              <div v-if="ctx.pageInsecure.value" class="amcp-alert amcp-alert--error">
                <i class="pi pi-exclamation-triangle" aria-hidden="true" />
                <span>{{ t('agentMcp.steps.webGuideInsecure') }}</span>
              </div>
              <div class="web-guide">
                <p class="web-guide-lead">{{ t('agentMcp.steps.webUnsupportedLead') }}</p>
                <div
                  class="amcp-chips"
                  role="tablist"
                  :aria-label="t('agentMcp.steps.webGuideTitle')"
                >
                  <button
                    v-for="browser in GUIDE_BROWSERS"
                    :key="browser.value"
                    type="button"
                    role="tab"
                    class="amcp-chip"
                    :class="{ 'amcp-chip--active': ctx.webMcpGuideBrowser.value === browser.value }"
                    :aria-selected="ctx.webMcpGuideBrowser.value === browser.value"
                    @click="ctx.webMcpGuideBrowser.value = browser.value"
                  >
                    {{ browser.label }}
                  </button>
                </div>
                <div v-if="ctx.webMcpGuide.value.flagUrl" class="amcp-inline">
                  <code class="amcp-code">{{ ctx.webMcpGuide.value.flagUrl }}</code>
                  <Button
                    icon="pi pi-copy"
                    text
                    size="small"
                    :aria-label="t('agentMcp.steps.copyFlagUrl')"
                    :title="t('agentMcp.steps.copyFlagUrl')"
                    @click="ctx.copyWebMcpFlagUrl"
                  />
                </div>
                <ol v-if="ctx.webMcpGuide.value.steps.length > 1" class="web-guide-steps">
                  <li v-for="step in ctx.webMcpGuide.value.steps" :key="step">{{ step }}</li>
                </ol>
                <p v-else class="web-guide-text">{{ ctx.webMcpGuide.value.steps[0] }}</p>
                <p v-if="ctx.webMcpGuide.value.note" class="amcp-hint">
                  {{ ctx.webMcpGuide.value.note }}
                </p>
                <p class="amcp-hint">{{ t('agentMcp.steps.webGuideExtension') }}</p>
                <p class="amcp-hint">{{ t('agentMcp.steps.webUnsupportedDesktop') }}</p>
              </div>
            </template>
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
  type WebMcpGuideBrowser,
} from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t, locale } = useI18n();
const ctx = injectAgentMcpPage();

/** 浏览器名称是专有名词，不随界面语言翻译 */
const GUIDE_BROWSERS: ReadonlyArray<{ value: WebMcpGuideBrowser; label: string }> = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'edge', label: 'Edge' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'safari', label: 'Safari' },
];

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

.web-guide {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--tsukuyomi-opacity-25);
  background: var(--tsukuyomi-opacity-8);
}

.web-guide-lead,
.web-guide-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-92);
}

.web-guide-steps {
  margin: 0;
  padding-left: 20px;
  list-style: decimal;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-92);
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
