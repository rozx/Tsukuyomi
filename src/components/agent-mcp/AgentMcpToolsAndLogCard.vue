<template>
  <section class="mcp-card">
    <div class="mcp-section">
      <header class="mcp-card-head">
        <h2 class="mcp-card-title">
          {{ t('agentMcp.toolsAndLog.toolsTitle') }} ({{ ctx.filteredTools.value.length }})
        </h2>
        <InputText
          v-model="ctx.toolSearchQuery.value"
          :placeholder="t('agentMcp.toolsAndLog.searchPlaceholder')"
          class="mcp-search"
        />
      </header>

      <div v-if="ctx.filteredTools.value.length === 0" class="mcp-empty">
        {{ t('agentMcp.toolsAndLog.noToolsMatch') }}
      </div>
      <div v-else class="mcp-tools-list">
        <div v-for="tool in ctx.filteredTools.value" :key="tool.name" class="mcp-tool-item">
          <div class="mcp-tool-head">
            <code class="mcp-tool-name">{{ tool.name }}</code>
            <Tag :value="toolBadgeLabel(tool)" :severity="toolBadgeSeverity(tool)" />
          </div>
          <p class="mcp-tool-desc">{{ tool.displayDescription }}</p>
        </div>
      </div>
    </div>

    <div class="mcp-section mcp-section--divider">
      <header class="mcp-card-head">
        <div>
          <h2 class="mcp-card-title">
            {{ t('agentMcp.toolsAndLog.logTitle') }} ({{ ctx.activities.value.length }})
          </h2>
          <p class="mcp-card-sub">{{ t('agentMcp.toolsAndLog.logHint') }}</p>
        </div>
        <Button
          :label="t('agentMcp.toolsAndLog.clearLog')"
          icon="pi pi-trash"
          size="small"
          text
          severity="secondary"
          :disabled="ctx.activities.value.length === 0"
          @click="ctx.clearActivities"
        />
      </header>

      <div v-if="ctx.activities.value.length === 0" class="mcp-empty">
        {{ t('agentMcp.toolsAndLog.emptyLog') }}
      </div>
      <div v-else class="mcp-log-list">
        <div v-for="entry in ctx.activities.value" :key="entry.id" class="mcp-log-item">
          <div class="mcp-log-top">
            <Tag :value="activityStatusLabel(entry)" :severity="activityStatusSeverity(entry)" />
            <code class="mcp-tool-name">{{ entry.toolName }}</code>
            <span class="mcp-log-meta">
              {{ getExternalChannelDisplayName(entry.channel) }} · {{ entry.durationMs }}ms ·
              {{ formatTime(entry.timestamp) }}
            </span>
          </div>
          <div class="mcp-log-args">{{ entry.argsSummary }}</div>
          <div v-if="entry.errorMessage" class="mcp-log-err">{{ entry.errorMessage }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';
import type { AgentMcpActivityEntry } from 'src/models/agent-mcp';
import type { AgentMcpToolDescriptor } from 'src/services/agent-mcp/types';
import { getExternalChannelDisplayName } from 'src/utils/translation-model-label';

const { t } = useI18n();
const ctx = injectAgentMcpPage();

function toolBadgeLabel(tool: AgentMcpToolDescriptor): string {
  if (tool.permission === 'full') return t('agentMcp.toolsAndLog.dangerBadge');
  return tool.readOnlyHint
    ? t('agentMcp.toolsAndLog.readOnlyBadge')
    : t('agentMcp.toolsAndLog.writeBadge');
}

function toolBadgeSeverity(tool: AgentMcpToolDescriptor): 'danger' | 'info' | 'warn' {
  if (tool.permission === 'full') return 'danger';
  return tool.readOnlyHint ? 'info' : 'warn';
}

function activityStatusLabel(entry: AgentMcpActivityEntry): string {
  if (entry.status === 'success') return t('agentMcp.toolsAndLog.statusSuccess');
  if (entry.status === 'denied') return t('agentMcp.toolsAndLog.statusDenied');
  return t('agentMcp.toolsAndLog.statusError');
}

function activityStatusSeverity(entry: AgentMcpActivityEntry): 'success' | 'warn' | 'danger' {
  if (entry.status === 'success') return 'success';
  if (entry.status === 'denied') return 'warn';
  return 'danger';
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
</script>

<style scoped>
.mcp-card {
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mcp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mcp-section--divider {
  padding-top: 16px;
  border-top: 1px solid var(--white-opacity-6);
}

.mcp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.mcp-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.mcp-card-sub {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
}

.mcp-search {
  width: 240px;
  max-width: 100%;
}

.mcp-tools-list,
.mcp-log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.mcp-tool-item,
.mcp-log-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--white-opacity-2-5);
  border: 1px solid var(--white-opacity-6);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mcp-tool-head,
.mcp-log-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mcp-tool-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--tsukuyomi-200);
}

.mcp-tool-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--moon-50-opacity-65);
}

.mcp-log-meta {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-50);
}

.mcp-log-args {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-70);
  word-break: break-all;
}

.mcp-log-err {
  font-size: 11px;
  color: #fca5a5;
}

.mcp-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--moon-50-opacity-55);
}
</style>
