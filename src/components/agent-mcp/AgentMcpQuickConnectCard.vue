<template>
  <section class="mcp-card">
    <header class="mcp-card-head">
      <div>
        <h2 class="mcp-card-title">{{ t('agentMcp.quickConnect.title') }}</h2>
        <p class="mcp-card-sub">
          {{
            ctx.isElectronEnv.value
              ? t('agentMcp.quickConnect.subtitle')
              : t('agentMcp.quickConnect.webSubtitle')
          }}
        </p>
      </div>
      <Button
        :label="t('agentMcp.quickConnect.copySnippet')"
        icon="pi pi-copy"
        size="small"
        @click="ctx.copyActiveSnippet"
      />
    </header>

    <div class="mcp-tabs" role="tablist">
      <button
        v-for="tab in ctx.connectTabs.value"
        :key="tab"
        type="button"
        role="tab"
        :aria-selected="ctx.activeConnectTab.value === tab"
        class="mcp-tab"
        :class="{ 'mcp-tab--active': ctx.activeConnectTab.value === tab }"
        @click="ctx.activeConnectTab.value = tab"
      >
        {{ tabLabel(tab) }}
      </button>
    </div>

    <pre class="mcp-snippet"><code>{{ ctx.activeSnippet.value }}</code></pre>

    <div class="mcp-prompts">
      <div class="mcp-prompts-head">
        <span class="mcp-prompts-title">{{ t('agentMcp.quickConnect.promptsTitle') }}</span>
        <span class="mcp-prompts-hint">{{ t('agentMcp.quickConnect.promptsHint') }}</span>
      </div>
      <div class="mcp-prompts-list">
        <div v-for="prompt in ctx.prompts.value" :key="prompt.name" class="mcp-prompt-item">
          <code class="mcp-prompt-name">{{ prompt.name }}</code>
          <span class="mcp-prompt-desc">{{ prompt.displayDescription }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import {
  injectAgentMcpPage,
  type AgentMcpConnectTab,
} from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t } = useI18n();
const ctx = injectAgentMcpPage();

function tabLabel(tab: AgentMcpConnectTab): string {
  switch (tab) {
    case 'claude-code':
      return t('agentMcp.quickConnect.tabClaudeCode');
    case 'pi':
      return t('agentMcp.quickConnect.tabPi');
    case 'antigravity':
      return t('agentMcp.quickConnect.tabAntigravity');
    case 'webmcp':
      return t('agentMcp.quickConnect.tabWebMcp');
  }
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
  gap: 14px;
}

.mcp-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mcp-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.mcp-card-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--moon-50-opacity-55);
}

.mcp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mcp-tab {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-8);
  background: var(--white-opacity-3);
  color: var(--moon-50-opacity-70);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.mcp-tab--active {
  background: var(--tsukuyomi-opacity-14);
  border-color: var(--tsukuyomi-opacity-40);
  color: var(--moon-50-opacity-100);
}

.mcp-snippet {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid var(--white-opacity-8);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
  color: var(--moon-50-opacity-92);
  overflow-x: auto;
  white-space: pre;
}

.mcp-prompts {
  padding-top: 10px;
  border-top: 1px solid var(--white-opacity-6);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-prompts-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mcp-prompts-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--moon-50-opacity-90);
}

.mcp-prompts-hint {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
}

.mcp-prompts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-prompt-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--white-opacity-2-5);
  border: 1px solid var(--white-opacity-6);
}

.mcp-prompt-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--tsukuyomi-200);
}

.mcp-prompt-desc {
  font-size: 11px;
  color: var(--moon-50-opacity-60);
}
</style>
