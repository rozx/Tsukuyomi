<template>
  <AgentMcpPanel
    :class="{ 'log-panel--fill': fill }"
    :title="`${t('agentMcp.activity.title')} (${ctx.activities.value.length})`"
    :hint="t('agentMcp.activity.hint')"
  >
    <template #actions>
      <Button
        :label="t('agentMcp.activity.clear')"
        icon="pi pi-trash"
        size="small"
        text
        severity="secondary"
        :disabled="ctx.activities.value.length === 0"
        @click="ctx.clearActivities"
      />
    </template>

    <p v-if="ctx.activities.value.length === 0" class="log-empty">
      {{ t('agentMcp.activity.empty') }}
    </p>
    <ul v-else class="log-list" :class="{ 'log-list--fill': fill }">
      <li v-for="entry in ctx.activities.value" :key="entry.id" class="log-item">
        <div class="log-top">
          <Tag :value="statusLabel(entry)" :severity="statusSeverity(entry)" />
          <code class="log-tool">{{ entry.toolName }}</code>
          <span class="log-meta">{{ entry.durationMs }}ms · {{ formatTime(entry.timestamp) }}</span>
        </div>
        <dl class="log-detail">
          <div class="log-detail-row">
            <dt>{{ t('agentMcp.activity.argsLabel') }}</dt>
            <dd :class="{ 'log-detail-empty': !entry.argsSummary }">
              {{ entry.argsSummary || t('agentMcp.activity.noArgs') }}
            </dd>
          </div>
          <div v-if="entry.resultSummary" class="log-detail-row">
            <dt>{{ t('agentMcp.activity.resultLabel') }}</dt>
            <dd>{{ entry.resultSummary }}</dd>
          </div>
        </dl>
        <div v-if="entry.errorMessage" class="log-error">{{ entry.errorMessage }}</div>
      </li>
    </ul>
  </AgentMcpPanel>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import AgentMcpPanel from 'src/components/agent-mcp/AgentMcpPanel.vue';
import { useFlatAgentMcpPanels } from 'src/components/agent-mcp/panel-surface';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';
import type { AgentMcpActivityEntry } from 'src/models/agent-mcp';

const { t, locale } = useI18n();
const ctx = injectAgentMcpPage();
// 在桌面看板的栏位里：占满栏高，标题不动、只有列表滚动
const fill = useFlatAgentMcpPanels();

const STATUS_META: Record<
  AgentMcpActivityEntry['status'],
  { labelKey: string; severity: 'success' | 'warn' | 'danger' }
> = {
  success: { labelKey: 'agentMcp.activity.statusSuccess', severity: 'success' },
  denied: { labelKey: 'agentMcp.activity.statusDenied', severity: 'warn' },
  error: { labelKey: 'agentMcp.activity.statusError', severity: 'danger' },
};

function statusLabel(entry: AgentMcpActivityEntry): string {
  return t(STATUS_META[entry.status].labelKey);
}

function statusSeverity(entry: AgentMcpActivityEntry): 'success' | 'warn' | 'danger' {
  return STATUS_META[entry.status].severity;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
</script>

<style scoped>
.log-empty {
  margin: 0;
  padding: 22px 12px;
  border-radius: 10px;
  border: 1px dashed var(--white-opacity-8);
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--moon-50-opacity-55);
}

.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
}

.log-panel--fill {
  flex: 1 1 0;
  min-height: 0;
}

.log-list--fill {
  flex: 1 1 0;
  min-height: 0;
  max-height: none;
  overscroll-behavior: contain;
}

.log-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-6);
  background: var(--white-opacity-2-5);
}

.log-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.log-tool {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--tsukuyomi-200);
}

.log-meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
}

.log-detail {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-detail-row {
  display: flex;
  gap: 8px;
  font-size: 11px;
  line-height: 1.5;
}

.log-detail-row dt {
  flex-shrink: 0;
  color: var(--moon-50-opacity-55);
}

.log-detail-row dd {
  margin: 0;
  min-width: 0;
  font-family: 'JetBrains Mono', monospace;
  color: var(--moon-50-opacity-78);
  word-break: break-all;
}

.log-detail-row dd.log-detail-empty {
  font-family: inherit;
  color: var(--moon-50-opacity-55);
}

.log-error {
  font-size: 11px;
  color: #fca5a5;
}
</style>
