<template>
  <AgentMcpPanel
    :title="t('agentMcp.catalog.title')"
    :hint="t('agentMcp.catalog.summary', { count: ctx.exposedTools.value.length })"
  >
    <ul class="group-list">
      <li v-for="group in ctx.toolGroups.value" :key="group.category" class="group">
        <button
          type="button"
          class="amcp-disclosure group-head"
          :aria-expanded="isExpanded(group.category)"
          @click="ctx.toggleToolCategory(group.category)"
        >
          <i
            class="pi"
            :class="isExpanded(group.category) ? 'pi-chevron-down' : 'pi-chevron-right'"
            aria-hidden="true"
          />
          <span class="group-label">{{ group.label }}</span>
          <span class="group-count">{{ group.tools.length }}</span>
        </button>
        <ul v-if="isExpanded(group.category)" class="item-list">
          <li v-for="tool in group.tools" :key="tool.name" class="item">
            <div class="item-head">
              <code class="item-name">{{ tool.name }}</code>
              <Tag :value="badgeLabel(tool)" :severity="badgeSeverity(tool)" />
            </div>
            <p class="item-desc">{{ tool.displayDescription }}</p>
          </li>
        </ul>
      </li>

      <li class="group">
        <button
          type="button"
          class="amcp-disclosure group-head"
          :aria-expanded="isExpanded(WORKFLOWS_KEY)"
          @click="ctx.toggleToolCategory(WORKFLOWS_KEY)"
        >
          <i
            class="pi"
            :class="isExpanded(WORKFLOWS_KEY) ? 'pi-chevron-down' : 'pi-chevron-right'"
            aria-hidden="true"
          />
          <span class="group-label">{{ t('agentMcp.catalog.workflows') }}</span>
          <span class="group-count">{{ ctx.prompts.value.length }}</span>
        </button>
        <ul v-if="isExpanded(WORKFLOWS_KEY)" class="item-list">
          <li v-for="prompt in ctx.prompts.value" :key="prompt.name" class="item">
            <code class="item-name">{{ prompt.name }}</code>
            <p class="item-desc">{{ prompt.displayDescription }}</p>
          </li>
        </ul>
      </li>
    </ul>
  </AgentMcpPanel>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import AgentMcpPanel from 'src/components/agent-mcp/AgentMcpPanel.vue';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';
import type { AgentMcpToolDescriptor } from 'src/services/agent-mcp/types';

/** 工作流模板分组在展开状态里使用的键（与工具类别共用同一个展开列表） */
const WORKFLOWS_KEY = 'workflows';

const { t } = useI18n();
const ctx = injectAgentMcpPage();

function isExpanded(key: string): boolean {
  return ctx.expandedToolCategories.value.includes(key);
}

function badgeLabel(tool: AgentMcpToolDescriptor): string {
  if (tool.permission === 'full') return t('agentMcp.catalog.dangerBadge');
  return tool.readOnlyHint ? t('agentMcp.catalog.readOnlyBadge') : t('agentMcp.catalog.writeBadge');
}

function badgeSeverity(tool: AgentMcpToolDescriptor): 'danger' | 'info' | 'warn' {
  if (tool.permission === 'full') return 'danger';
  return tool.readOnlyHint ? 'info' : 'warn';
}
</script>

<style scoped>
.group-list,
.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.group-list {
  gap: 6px;
}

.item-list {
  gap: 6px;
  padding: 6px 0 4px 22px;
}

.group-head {
  width: 100%;
}

.group-label {
  flex: 1;
  min-width: 0;
}

.group-count {
  font-size: 12px;
  color: var(--moon-50-opacity-55);
}

.item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--tsukuyomi-200);
  word-break: break-all;
}

.item-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--moon-50-opacity-60);
}
</style>
