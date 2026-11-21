<template>
  <div class="agent-mcp-page">
    <PageHeader
      :eyebrow="t('agentMcp.eyebrow')"
      :title="t('agentMcp.title')"
      :description="t('agentMcp.subtitle')"
      :stats="ctx.summaryMetrics.value"
    />

    <!--
      按本页可用宽度（不是窗口宽度，侧边栏展开与否都能正确切换）分三档，页面本身不滚动、只有栏内滚动：
      - 宽：「接入」「调用活动」各占一栏，右侧栏用标签切换权限与写回 / 开放的能力 / 连接
      - 中（含平板横屏）：「接入」固定在左侧，右侧栏用标签切换其余分栏
      - 窄（含平板竖屏）：标签在顶部，一次显示一栏
      分栏选择存在页面 composable 里，宽度变化或断点切换后保留。
    -->
    <div class="amp-body">
      <nav class="amp-tabs" role="tablist" :aria-label="t('agentMcp.title')">
        <button
          v-for="section in ctx.sections.value"
          :key="section.key"
          type="button"
          role="tab"
          class="amp-tab"
          :class="[`amp-tab--${section.key}`, sectionState(section.key, 'amp-tab')]"
          @click="ctx.selectSection(section.key)"
        >
          {{ section.label }}
          <span v-if="section.badge" class="amp-tab-badge">{{ section.badge }}</span>
        </button>
      </nav>

      <section
        v-for="pane in panes"
        :key="pane.key"
        class="amp-pane"
        :class="[`amp-pane--${pane.key}`, sectionState(pane.key, 'amp-pane')]"
      >
        <component :is="pane.component" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import AgentMcpActivityLog from 'src/components/agent-mcp/AgentMcpActivityLog.vue';
import AgentMcpConnectionSettings from 'src/components/agent-mcp/AgentMcpConnectionSettings.vue';
import AgentMcpPermissionPanel from 'src/components/agent-mcp/AgentMcpPermissionPanel.vue';
import AgentMcpSetupSteps from 'src/components/agent-mcp/AgentMcpSetupSteps.vue';
import AgentMcpToolCatalog from 'src/components/agent-mcp/AgentMcpToolCatalog.vue';
import PageHeader from 'src/components/layout/PageHeader.vue';
import { provideFlatAgentMcpPanels } from 'src/components/agent-mcp/panel-surface';
import {
  injectAgentMcpPage,
  type AgentMcpSection,
} from 'src/composables/agent-mcp-page/useAgentMcpPage';

/**
 * 外部 Agent 工作台（桌面与平板共用）：统一页头（PageHeader），
 * 内容用分隔线划分的平铺区域，不套卡片；三档宽度见模板注释。
 */
const { t } = useI18n();
const ctx = injectAgentMcpPage();
// 各区域由本页用分隔线划分，面板自身不带卡片外框
provideFlatAgentMcpPanels();

const PANE_COMPONENTS: Record<AgentMcpSection, Component> = {
  connect: AgentMcpSetupSteps,
  activity: AgentMcpActivityLog,
  permission: AgentMcpPermissionPanel,
  tools: AgentMcpToolCatalog,
  connection: AgentMcpConnectionSettings,
};

// 分栏与标签一一对应（连接设置只在 Electron 中出现，由 ctx.sections 决定）
const panes = computed(() =>
  ctx.sections.value.map((section) => ({
    key: section.key,
    component: PANE_COMPONENTS[section.key],
  })),
);

/**
 * 标签与分栏在三档下各自的「当前」：窄档看 activeSection，中档右侧栏看 secondarySection，
 * 宽档第三栏看 sideSection。三种状态都输出成修饰类，由 CSS 按档位决定用哪一个。
 */
const sectionState = (key: AgentMcpSection, prefix: string) => ({
  [`${prefix}--current`]: ctx.activeSection.value === key,
  [`${prefix}--secondary`]: ctx.secondarySection.value === key,
  [`${prefix}--side`]: ctx.sideSection.value === key,
});
</script>

<style scoped>
.agent-mcp-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
}

/* ───────────── 标签 ───────────── */
.amp-tabs {
  display: flex;
  gap: 20px;
  padding: 0 20px;
  border-bottom: 1px solid var(--white-opacity-6);
  overflow-x: auto;
  scrollbar-width: none;
}

.amp-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 0 10px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--moon-50-opacity-55);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color 150ms ease,
    border-color 150ms ease;
}

.amp-tab:hover {
  color: var(--moon-50-opacity-85);
}

.amp-tab-badge {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--tsukuyomi-opacity-14);
  font-size: 10.5px;
  line-height: 16px;
  color: var(--tsukuyomi-200);
}

/* ───────────── 分栏：默认（宽档）三栏 ───────────── */
.amp-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(320px, 380px);
  grid-template-rows: auto minmax(0, 1fr);
}

/* 右侧栏：标签条与分栏共用的底色与分隔线 */
.amp-tabs,
.amp-pane--side,
.amp-pane--secondary {
  border-left: 1px solid var(--white-opacity-6);
  background: rgba(0, 0, 0, 0.18);
}

.amp-tabs {
  grid-column: 3;
  grid-row: 1;
}

/* 宽档：接入、调用活动常驻，只在第三栏的分栏间切换 */
.amp-tab--connect,
.amp-tab--activity {
  display: none;
}

.amp-tab--side {
  color: var(--primary-200);
  font-weight: 600;
  border-bottom-color: var(--tsukuyomi-300);
}

.amp-pane {
  display: none;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 20px 24px;
}

.amp-pane--connect {
  display: flex;
  grid-column: 1;
  grid-row: 1 / span 2;
  padding: 20px 32px 28px;
  background: none;
  border-left: none;
}

/* 步骤说明不要被拉得太宽，便于阅读 */
.amp-pane--connect > :deep(*) {
  max-width: 760px;
}

/* 调用活动：标题固定，只有列表滚动 */
.amp-pane--activity {
  display: flex;
  grid-column: 2;
  grid-row: 1 / span 2;
  overflow: hidden;
  padding: 20px 24px 24px;
  border-left: 1px solid var(--white-opacity-6);
  background: none;
}

.amp-pane--side {
  display: flex;
  grid-column: 3;
  grid-row: 2;
}

/* ───────────── 中档：接入 + 右侧栏 ───────────── */
@container (max-width: 78rem) {
  .amp-body {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
  }

  .amp-tabs {
    grid-column: 2;
  }

  .amp-tab--activity {
    display: inline-flex;
  }

  .amp-tabs .amp-tab--side {
    color: var(--moon-50-opacity-55);
    font-weight: 500;
    border-bottom-color: transparent;
  }

  .amp-tabs .amp-tab--secondary {
    color: var(--primary-200);
    font-weight: 600;
    border-bottom-color: var(--tsukuyomi-300);
  }

  .amp-body .amp-pane--activity,
  .amp-body .amp-pane--side {
    display: none;
  }

  .amp-body .amp-pane.amp-pane--secondary {
    display: flex;
    grid-column: 2;
    grid-row: 2;
    padding: 18px 20px 24px;
    border-left: 1px solid var(--white-opacity-6);
    background: rgba(0, 0, 0, 0.18);
  }
}

/* ───────────── 窄档：顶部标签，一次一栏 ───────────── */
@container (max-width: 52rem) {
  .amp-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .amp-tabs {
    grid-column: 1;
    border-left: none;
    background: none;
  }

  .amp-tabs .amp-tab--connect {
    display: inline-flex;
  }

  .amp-tabs .amp-tab--secondary {
    color: var(--moon-50-opacity-55);
    font-weight: 500;
    border-bottom-color: transparent;
  }

  .amp-tabs .amp-tab--current {
    color: var(--primary-200);
    font-weight: 600;
    border-bottom-color: var(--tsukuyomi-300);
  }

  .amp-body .amp-pane,
  .amp-body .amp-pane.amp-pane--secondary {
    display: none;
    grid-column: 1;
    grid-row: 2;
    padding: 18px 20px 24px;
    border-left: none;
    background: none;
  }

  .amp-body .amp-pane.amp-pane--current {
    display: flex;
  }
}
</style>
