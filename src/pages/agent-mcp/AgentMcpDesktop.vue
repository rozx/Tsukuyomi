<template>
  <div class="desktop-agent-mcp-page">
    <DesktopWorkbenchHeader
      :eyebrow="t('agentMcp.eyebrow')"
      :title="t('agentMcp.title')"
      :description="t('agentMcp.subtitle')"
    >
      <template #metrics>
        <DesktopWorkbenchMetrics :items="ctx.summaryMetrics.value" />
      </template>
    </DesktopWorkbenchHeader>

    <!--
      按本页可用宽度分三档，页面本身都不滚动、只有栏内滚动：
      - 宽：三栏并排（接入 / 调用活动 / 权限与能力）
      - 中：两栏，左栏固定为接入，右栏用标签在其余分栏间切换
      - 窄（含平板）：顶部分栏标签，一次显示一栏
    -->
    <div class="mcp-board">
      <nav class="mcp-tabs" role="tablist" :aria-label="t('agentMcp.title')">
        <button
          v-for="section in ctx.sections.value"
          :key="section.key"
          type="button"
          role="tab"
          class="amcp-chip mcp-tab"
          :class="{
            'mcp-tab--connect': section.key === 'connect',
            'mcp-tab--current': ctx.activeSection.value === section.key,
            'mcp-tab--secondary': ctx.secondarySection.value === section.key,
          }"
          @click="ctx.selectSection(section.key)"
        >
          {{ section.label }}
          <span v-if="section.badge" class="mcp-tab-badge">{{ section.badge }}</span>
        </button>
      </nav>

      <DesktopWorkbenchSurface
        class="mcp-col mcp-col--connect"
        :class="{ 'mcp-col--current': ctx.activeSection.value === 'connect' }"
        tone="muted"
      >
        <AgentMcpSetupSteps />
      </DesktopWorkbenchSurface>

      <DesktopWorkbenchSurface
        class="mcp-col mcp-col--activity"
        :class="{
          'mcp-col--current': ctx.activeSection.value === 'activity',
          'mcp-col--secondary': ctx.secondarySection.value === 'activity',
        }"
        tone="muted"
      >
        <AgentMcpActivityLog />
      </DesktopWorkbenchSurface>

      <DesktopWorkbenchSurface
        class="mcp-col mcp-col--side"
        :class="{ 'mcp-col--current': sideActive, 'mcp-col--secondary': sideActive }"
        tone="muted"
      >
        <div
          class="mcp-side-item"
          :class="{ 'mcp-side-item--current': ctx.activeSection.value === 'permission' }"
        >
          <AgentMcpPermissionPanel />
        </div>
        <div
          class="mcp-side-item"
          :class="{ 'mcp-side-item--current': ctx.activeSection.value === 'tools' }"
        >
          <AgentMcpToolCatalog />
        </div>
        <div
          v-if="ctx.isElectronEnv.value"
          class="mcp-side-item"
          :class="{ 'mcp-side-item--current': ctx.activeSection.value === 'connection' }"
        >
          <AgentMcpConnectionSettings />
        </div>
      </DesktopWorkbenchSurface>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchMetrics from 'src/components/desktop/DesktopWorkbenchMetrics.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import AgentMcpActivityLog from 'src/components/agent-mcp/AgentMcpActivityLog.vue';
import AgentMcpConnectionSettings from 'src/components/agent-mcp/AgentMcpConnectionSettings.vue';
import AgentMcpPermissionPanel from 'src/components/agent-mcp/AgentMcpPermissionPanel.vue';
import AgentMcpSetupSteps from 'src/components/agent-mcp/AgentMcpSetupSteps.vue';
import AgentMcpToolCatalog from 'src/components/agent-mcp/AgentMcpToolCatalog.vue';
import { provideFlatAgentMcpPanels } from 'src/components/agent-mcp/panel-surface';
import { injectAgentMcpPage } from 'src/composables/agent-mcp-page/useAgentMcpPage';

const { t } = useI18n();
const ctx = injectAgentMcpPage();
// 各栏的外框由本页提供，面板自身不再带卡片外框
provideFlatAgentMcpPanels();

// 第三栏里的三块内容在中、窄两档下各是一个分栏标签
const sideActive = computed(() =>
  ['permission', 'tools', 'connection'].includes(ctx.activeSection.value),
);
</script>

<style scoped>
.desktop-agent-mcp-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.85rem 1.1rem 1.25rem;
  /* 按本页可用宽度（而不是窗口宽度）决定三栏还是分栏标签：侧边栏展开与否都能正确切换 */
  container-type: inline-size;
}

.mcp-board {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(18.5rem, 23rem);
  gap: 0.8rem;
}

.mcp-tabs {
  display: none;
  flex-wrap: wrap;
  gap: 8px;
}

.mcp-tab-badge {
  margin-left: 0.35rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--tsukuyomi-opacity-14);
  font-size: 0.7rem;
  color: var(--tsukuyomi-200);
}

/* 每一栏占满看板高度，内容超出时在栏内滚动 */
.mcp-col {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 调用活动栏：标题固定，只有列表滚动 */
.mcp-col--activity {
  overflow: hidden;
}

.mcp-side-item + .mcp-side-item {
  margin-top: 1.2rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--white-opacity-6);
}

/* 中档：左栏接入，右栏按标签切换 */
@container (min-width: 52.01rem) and (max-width: 78rem) {
  .mcp-board {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .mcp-tabs {
    display: flex;
    grid-column: 2;
    grid-row: 1;
  }

  .mcp-tab--connect {
    display: none;
  }

  .mcp-tab--secondary {
    background: var(--tsukuyomi-opacity-14);
    border-color: var(--tsukuyomi-opacity-40);
    color: var(--moon-50-opacity-100);
  }

  .mcp-col--connect {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .mcp-col--activity,
  .mcp-col--side {
    display: none;
    grid-column: 2;
    grid-row: 2;
  }

  .mcp-col--secondary {
    display: flex;
  }
}

/* 窄档：一次一栏 */
@container (max-width: 52rem) {
  .mcp-board {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .mcp-tabs {
    display: flex;
  }

  .mcp-tab--current {
    background: var(--tsukuyomi-opacity-14);
    border-color: var(--tsukuyomi-opacity-40);
    color: var(--moon-50-opacity-100);
  }

  .mcp-col {
    display: none;
  }

  .mcp-col--current {
    display: flex;
  }
}

/* 中、窄两档下第三栏一次只显示一块 */
@container (max-width: 78rem) {
  .mcp-side-item {
    display: none;
  }

  .mcp-side-item--current {
    display: block;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 820px) {
  .desktop-agent-mcp-page {
    padding-inline: 0.85rem;
  }
}
</style>
