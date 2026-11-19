<template>
  <div class="desktop-agent-mcp-page">
    <DesktopWorkbenchHeader
      :eyebrow="t('agentMcp.eyebrow')"
      :title="t('agentMcp.title')"
      :description="t('agentMcp.subtitle')"
    >
      <template #metrics>
        <DesktopWorkbenchMetrics :items="ctx.metrics.value" />
      </template>
    </DesktopWorkbenchHeader>

    <div class="mcp-desktop-grid">
      <div class="mcp-desktop-col">
        <AgentMcpConnectionCard />
      </div>
      <div class="mcp-desktop-col">
        <AgentMcpQuickConnectCard />
        <AgentMcpToolsAndLogCard />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchMetrics from 'src/components/desktop/DesktopWorkbenchMetrics.vue';
import AgentMcpConnectionCard from 'src/components/agent-mcp/AgentMcpConnectionCard.vue';
import AgentMcpQuickConnectCard from 'src/components/agent-mcp/AgentMcpQuickConnectCard.vue';
import AgentMcpToolsAndLogCard from 'src/components/agent-mcp/AgentMcpToolsAndLogCard.vue';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t } = useI18n();
const ctx = injectAgentMcpPage();
</script>

<style scoped>
.desktop-agent-mcp-page {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px 36px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mcp-desktop-grid {
  display: grid;
  grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.mcp-desktop-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

@media (max-width: 1080px) {
  .mcp-desktop-grid {
    grid-template-columns: 1fr;
  }
}
</style>
