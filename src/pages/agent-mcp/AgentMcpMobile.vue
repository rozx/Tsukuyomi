<template>
  <div class="mobile-agent-mcp-page">
    <header class="mcp-mobile-head">
      <div class="mcp-mobile-eyebrow">{{ t('agentMcp.eyebrow') }}</div>
      <h1 class="mcp-mobile-title">{{ t('agentMcp.title') }}</h1>
      <p class="mcp-mobile-sub">{{ t('agentMcp.subtitle') }}</p>
    </header>

    <div class="mcp-mobile-stack">
      <AgentMcpSetupSteps />
      <AgentMcpActivityLog />
      <AgentMcpPermissionPanel />
      <AgentMcpConnectionSettings />
      <AgentMcpToolCatalog />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AgentMcpActivityLog from 'src/components/agent-mcp/AgentMcpActivityLog.vue';
import AgentMcpConnectionSettings from 'src/components/agent-mcp/AgentMcpConnectionSettings.vue';
import AgentMcpPermissionPanel from 'src/components/agent-mcp/AgentMcpPermissionPanel.vue';
import AgentMcpSetupSteps from 'src/components/agent-mcp/AgentMcpSetupSteps.vue';
import AgentMcpToolCatalog from 'src/components/agent-mcp/AgentMcpToolCatalog.vue';

const { t } = useI18n();
</script>

<style scoped>
.mobile-agent-mcp-page {
  padding: 16px 14px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mcp-mobile-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mcp-mobile-eyebrow {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--tsukuyomi-300-opacity-75);
  text-transform: uppercase;
}

.mcp-mobile-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.mcp-mobile-sub {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-60);
}

.mcp-mobile-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
