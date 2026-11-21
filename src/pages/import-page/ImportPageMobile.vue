<script setup lang="ts">
/**
 * 手机导入工作台：分两层——
 * - 任务列表：未打开任务时整页显示（返回 + 标题 + 任务列表），选择或新建任务后进入任务；
 *   导入页不在底部栏，返回回到进入前的页面（直接打开时回到首页）；
 * - 任务内：顶部「‹」返回任务列表，旁边是对话／来源／草稿／方案四段切换；
 *   对话占满两栏之间的高度（输入框贴底），章节正文检查以整屏替代列表。
 * 底部栏的「月詠」在导入路由下切到对话分区。
 */
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageKey } from 'src/i18n/types';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportRunBar from 'src/components/import/ImportRunBar.vue';
import ImportSourcePanel from 'src/components/import/ImportSourcePanel.vue';
import ImportDraftPanel from 'src/components/import/ImportDraftPanel.vue';
import ImportChapterPreview from 'src/components/import/ImportChapterPreview.vue';
import ImportPlanPanel from 'src/components/import/ImportPlanPanel.vue';
import ImportChatPanel from 'src/components/import/ImportChatPanel.vue';
import { injectImportPage, type ImportSection } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useUiStore } from 'src/stores/ui';

const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const ui = useUiStore();
const { t } = useI18n();

// 任务内的分区（「任务」不是任务内的分区，用返回按钮回到列表）
const sections: { id: ImportSection; label: MessageKey }[] = [
  { id: 'chat', label: 'importUi.page.chat' },
  { id: 'sources', label: 'importUi.page.sources' },
  { id: 'draft', label: 'importUi.page.draft' },
  { id: 'plan', label: 'importUi.page.planShort' },
];

const current = computed<ImportSection>(() =>
  ctx.section.value === 'tasks' ? 'chat' : ctx.section.value,
);
const select = (id: ImportSection) => {
  ctx.section.value = id;
};

// 底部栏「月詠」在导入路由下不再打开抽屉，而是切到对话分区
watch(
  () => ui.rightPanelOpen && ui.activeRightTab === 'chat',
  (open) => {
    if (!open) return;
    ui.closeRightPanel();
    if (store.task) select('chat');
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="!store.task" class="ipm">
    <header class="ipm-head">
      <button
        type="button"
        class="ipm-back"
        :title="t('importUi.page.back')"
        :aria-label="t('importUi.page.back')"
        @click="ctx.leave()"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
      </button>
      <div class="ipm-head-text">
        <div class="ipm-eyebrow">{{ t('importUi.page.title') }}</div>
        <h1 class="ipm-title">{{ t('importUi.page.workbench') }}</h1>
        <p class="ipm-sub">{{ t('importUi.page.summary') }}</p>
      </div>
    </header>
    <div class="ipm-body">
      <ImportTaskList navigable />
    </div>
  </div>

  <div v-else class="ipm" :class="{ 'ipm--chat': current === 'chat' }">
    <nav class="ipm-bar" :aria-label="t('importUi.page.sections')">
      <button
        type="button"
        class="ipm-back"
        :title="t('importUi.page.allTasks')"
        :aria-label="t('importUi.page.allTasks')"
        @click="ctx.closeTask()"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
      </button>
      <div class="ipm-seg">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          class="ipm-seg-btn"
          :class="{ 'ipm-seg-btn--active': current === item.id }"
          :aria-pressed="current === item.id"
          @click="select(item.id)"
        >
          {{ t(item.label) }}
        </button>
      </div>
    </nav>

    <div v-if="current === 'chat'" class="ipm-chat">
      <ImportChatPanel />
    </div>
    <div v-else class="ipm-body">
      <ImportRunBar />
      <ImportSourcePanel v-if="current === 'sources'" />
      <template v-else-if="current === 'draft'">
        <ImportChapterPreview v-if="ctx.selectedChapterId.value" />
        <ImportDraftPanel v-else />
      </template>
      <ImportPlanPanel v-else />
    </div>
  </div>
</template>

<style scoped>
.ipm {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* ───────────── 任务列表 ───────────── */
.ipm-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px 4px;
}

.ipm-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ipm-eyebrow {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--tsukuyomi-300-opacity-75);
  text-transform: uppercase;
}

.ipm-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--moon-50-opacity-100);
}

.ipm-sub {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-60);
}

/* ───────────── 任务内：返回 + 分区切换 ───────────── */
.ipm-bar {
  position: sticky;
  top: var(--mobile-sysbar-height, 0px);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(10, 12, 15, 0.86);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--white-opacity-6);
}

.ipm-back {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--btn-ghost-border);
  border-radius: var(--btn-radius);
  background: transparent;
  color: var(--btn-ghost-color);
}

.ipm-back i {
  font-size: 13px;
}

.ipm-seg {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--white-opacity-4);
}

.ipm-seg-btn {
  min-width: 0;
  min-height: 30px;
  padding: 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 8px;
  font-size: 0.82rem;
  color: var(--moon-50-opacity-60);
}

.ipm-seg-btn--active {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-color);
  font-weight: 600;
}

/* 对话：占满顶栏与底部栏之间的高度，输入框贴底 */
.ipm--chat {
  height: calc(100dvh - var(--mobile-sysbar-height, 0px) - var(--mobile-tabbar-height, 0px));
  min-height: 0;
}

.ipm-chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipm-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 14px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
}
</style>
