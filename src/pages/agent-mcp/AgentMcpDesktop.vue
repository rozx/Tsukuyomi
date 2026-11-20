<template>
  <div class="desktop-agent-mcp-page">
    <DesktopWorkbenchHeader
      :eyebrow="t('agentMcp.eyebrow')"
      :title="t('agentMcp.title')"
      :description="t('agentMcp.subtitle')"
    />

    <div class="mcp-desktop-grid">
      <!-- 主栏：按使用顺序完成接入，随后盯着调用活动 -->
      <div class="mcp-desktop-col">
        <AgentMcpSetupSteps />
        <AgentMcpActivityLog />
      </div>
      <!-- 侧栏：一次设好就很少再动的内容 -->
      <div class="mcp-desktop-col">
        <AgentMcpPermissionPanel />
        <AgentMcpConnectionSettings />
        <AgentMcpToolCatalog />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import AgentMcpActivityLog from 'src/components/agent-mcp/AgentMcpActivityLog.vue';
import AgentMcpConnectionSettings from 'src/components/agent-mcp/AgentMcpConnectionSettings.vue';
import AgentMcpPermissionPanel from 'src/components/agent-mcp/AgentMcpPermissionPanel.vue';
import AgentMcpSetupSteps from 'src/components/agent-mcp/AgentMcpSetupSteps.vue';
import AgentMcpToolCatalog from 'src/components/agent-mcp/AgentMcpToolCatalog.vue';

const { t } = useI18n();
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
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
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
