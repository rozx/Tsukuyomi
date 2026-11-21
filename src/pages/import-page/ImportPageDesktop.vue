<script setup lang="ts">
/**
 * 导入工作台（桌面与平板共用）：统一页头（PageHeader），下方为分隔线划分的平铺区域——
 * 桌面左侧为任务列表栏，右侧工作区为运行条 + 来源／卷章草稿／导入方案标签；
 * 月詠对话由布局右栏的导入聊天外壳常驻承载（绑定当前任务）。
 * 平板右侧停靠对话后宽度有限，以 tasksInTabs 把任务列表并入标签页。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import PageHeader from 'src/components/layout/PageHeader.vue';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportRunBar from 'src/components/import/ImportRunBar.vue';
import ImportSourcePanel from 'src/components/import/ImportSourcePanel.vue';
import ImportDraftPanel from 'src/components/import/ImportDraftPanel.vue';
import ImportChapterPreview from 'src/components/import/ImportChapterPreview.vue';
import ImportPlanPanel from 'src/components/import/ImportPlanPanel.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const props = withDefaults(defineProps<{ tasksInTabs?: boolean }>(), { tasksInTabs: false });
const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const { t } = useI18n();

// 对话常驻右侧，不是标签页；桌面的任务列表常驻左侧，平板并入标签页
const tab = computed({
  get: () => {
    const section = ctx.section.value;
    if (section === 'chat' || (section === 'tasks' && !props.tasksInTabs)) return 'draft';
    return section;
  },
  set: (value: string) => {
    ctx.section.value = value as typeof ctx.section.value;
  },
});
const sourceCount = computed(() => store.sources.length);
const chapterCount = computed(() => store.task?.draft.chapters.length ?? 0);

// 页头统计：任务数，以及当前任务的来源与章节数（未选任务时显示 —）
const headerStats = computed(() => [
  { label: t('importUi.page.tasks'), value: store.tasks.length },
  { label: t('importUi.page.sources'), value: store.task ? sourceCount.value : '—' },
  { label: t('importUi.page.chapters'), value: store.task ? chapterCount.value : '—' },
]);
</script>

<template>
  <div class="ipd" :class="{ 'ipd--compact': tasksInTabs }">
    <PageHeader
      :eyebrow="t('importUi.page.title')"
      :title="t('importUi.page.workbench')"
      :description="t('importUi.page.summary')"
      :stats="headerStats"
    />

    <div class="ipd-body">
      <aside v-if="!tasksInTabs" class="ipd-tasks">
        <ImportTaskList />
      </aside>

      <main class="ipd-work">
        <div v-if="!store.task && tasksInTabs" class="ipd-pane">
          <ImportTaskList />
        </div>

        <div v-else-if="!store.task" class="ipd-empty">
          <i class="pi pi-file-import ipd-empty-icon" aria-hidden="true" />
          <h2 class="ipd-empty-title">{{ t('importUi.page.title') }}</h2>
          <p class="ipd-empty-text">{{ t('importUi.page.intro') }}</p>
          <Button icon="pi pi-plus" :label="t('importUi.page.create')" @click="ctx.createTask" />
        </div>

        <div v-else class="ipd-main">
          <div class="ipd-runbar">
            <ImportRunBar />
          </div>
          <Tabs v-model:value="tab" class="ipd-tabs">
            <TabList>
              <Tab v-if="tasksInTabs" value="tasks">{{ t('importUi.page.tasks') }}</Tab>
              <Tab value="sources">{{ t('importUi.page.sourcesTab', { count: sourceCount }) }}</Tab>
              <Tab value="draft">{{ t('importUi.page.draftTab', { count: chapterCount }) }}</Tab>
              <Tab value="plan">{{ t('importUi.page.plan') }}</Tab>
            </TabList>
            <TabPanels class="ipd-panels">
              <TabPanel v-if="tasksInTabs" value="tasks">
                <ImportTaskList />
              </TabPanel>
              <TabPanel value="sources">
                <ImportSourcePanel />
              </TabPanel>
              <TabPanel value="draft">
                <div class="ipd-draft" :class="{ 'ipd-draft--split': ctx.selectedChapterId.value }">
                  <ImportDraftPanel />
                  <div v-if="ctx.selectedChapterId.value" class="ipd-preview">
                    <ImportChapterPreview />
                  </div>
                </div>
              </TabPanel>
              <TabPanel value="plan">
                <ImportPlanPanel />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.ipd {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ───────────── 页头下方：任务列表栏 + 工作区 ───────────── */
.ipd-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
}

.ipd--compact .ipd-body {
  grid-template-columns: minmax(0, 1fr);
}

.ipd-tasks {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 16px 20px;
  border-right: 1px solid var(--white-opacity-6);
  background: rgba(0, 0, 0, 0.18);
}

.ipd-work {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipd-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px 24px;
}

.ipd-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipd-runbar {
  flex-shrink: 0;
  padding: 14px 28px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
}

/* ───────────── 标签：与外部 Agent 页的下划线标签一致 ───────────── */
.ipd-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipd-tabs :deep(.p-tablist) {
  flex-shrink: 0;
  padding: 0 28px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.ipd-tabs :deep(.p-tablist-tab-list) {
  gap: 20px;
  background: transparent;
  border: none;
}

.ipd-tabs :deep(.p-tab) {
  padding: 12px 0 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--moon-50-opacity-55);
  background: transparent;
  border: none;
}

.ipd-tabs :deep(.p-tab:hover) {
  color: var(--moon-50-opacity-85);
}

.ipd-tabs :deep(.p-tab-active) {
  color: var(--primary-200);
  font-weight: 600;
}

.ipd-tabs :deep(.p-tablist-active-bar) {
  height: 2px;
  background: var(--tsukuyomi-300);
}

.ipd-tabs :deep(.p-tabpanels) {
  background: transparent;
  padding: 18px 28px 24px;
}

.ipd-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 标签内容撑满可视高度；并排检查时左右两栏各自滚动，外层不滚动 */
.ipd-panels :deep(.p-tabpanel) {
  height: 100%;
}

.ipd-draft {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.ipd-draft--split {
  height: 100%;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.ipd-draft--split > * {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ipd-preview {
  padding: 0.9rem 1rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

/* ───────────── 未选任务 ───────────── */
.ipd-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.9rem;
  padding: 24px;
}

.ipd-empty-icon {
  font-size: 2.4rem;
  color: var(--tsukuyomi-300);
}

.ipd-empty-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.3;
  margin: 0;
  color: var(--moon-50-opacity-100);
}

.ipd-empty-text {
  max-width: 34rem;
  font-size: 0.85rem;
  line-height: 1.8;
  color: var(--moon-50-opacity-60);
  margin: 0;
}

@media (max-width: 1100px) {
  .ipd-draft--split {
    height: auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }

  .ipd-draft--split > * {
    overflow: visible;
  }
}
</style>
