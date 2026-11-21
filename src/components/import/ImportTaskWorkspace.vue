<script setup lang="ts">
/**
 * 已打开的导入任务的工作区（桌面与平板共用）：运行条 + 来源／卷章草稿／导入方案标签。
 * withChat 时最前面多一个「对话」标签，承载月詠对话（平板竖屏不停靠右侧对话栏时使用）。
 * 标签选择存在页面 composable 的 section 里，断点或横竖屏切换后保留。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ImportRunBar from './ImportRunBar.vue';
import ImportSourcePanel from './ImportSourcePanel.vue';
import ImportDraftPanel from './ImportDraftPanel.vue';
import ImportChapterPreview from './ImportChapterPreview.vue';
import ImportPlanPanel from './ImportPlanPanel.vue';
import ImportChatPanel from './ImportChatPanel.vue';
import { injectImportPage, type ImportSection } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const props = withDefaults(defineProps<{ withChat?: boolean }>(), { withChat: false });
const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const { t } = useI18n();

// 「任务」不是任务内的分区；没有对话标签时，对话分区落到卷章草稿
const tab = computed({
  get: () => {
    const section = ctx.section.value;
    if (section === 'tasks' || (section === 'chat' && !props.withChat)) return 'draft';
    return section;
  },
  set: (value: string) => {
    ctx.section.value = value as ImportSection;
  },
});
const sourceCount = computed(() => store.sources.length);
const chapterCount = computed(() => store.task?.draft.chapters.length ?? 0);
</script>

<template>
  <div class="itw">
    <div class="itw-runbar">
      <ImportRunBar />
    </div>
    <Tabs v-model:value="tab" class="itw-tabs">
      <TabList>
        <Tab v-if="withChat" value="chat">{{ t('importUi.page.chat') }}</Tab>
        <Tab value="sources">{{ t('importUi.page.sourcesTab', { count: sourceCount }) }}</Tab>
        <Tab value="draft">{{ t('importUi.page.draftTab', { count: chapterCount }) }}</Tab>
        <Tab value="plan">{{ t('importUi.page.plan') }}</Tab>
      </TabList>
      <TabPanels class="itw-panels" :class="{ 'itw-panels--chat': tab === 'chat' }">
        <TabPanel v-if="withChat" value="chat">
          <ImportChatPanel />
        </TabPanel>
        <TabPanel value="sources">
          <ImportSourcePanel />
        </TabPanel>
        <TabPanel value="draft">
          <div class="itw-draft" :class="{ 'itw-draft--split': ctx.selectedChapterId.value }">
            <ImportDraftPanel />
            <div v-if="ctx.selectedChapterId.value" class="itw-preview">
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
</template>

<style scoped>
.itw {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.itw-runbar {
  flex-shrink: 0;
  padding: 14px 28px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
}

/* ───────────── 标签：与外部 Agent 页的下划线标签一致 ───────────── */
.itw-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.itw-tabs :deep(.p-tablist) {
  flex-shrink: 0;
  padding: 0 28px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.itw-tabs :deep(.p-tablist-tab-list) {
  gap: 20px;
  background: transparent;
  border: none;
}

.itw-tabs :deep(.p-tab) {
  padding: 12px 0 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--moon-50-opacity-55);
  background: transparent;
  border: none;
}

.itw-tabs :deep(.p-tab:hover) {
  color: var(--moon-50-opacity-85);
}

.itw-tabs :deep(.p-tab-active) {
  color: var(--primary-200);
  font-weight: 600;
}

.itw-tabs :deep(.p-tablist-active-bar) {
  height: 2px;
  background: var(--tsukuyomi-300);
}

.itw-tabs :deep(.p-tabpanels) {
  background: transparent;
  padding: 18px 28px 24px;
}

.itw-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 标签内容撑满可视高度；并排检查时左右两栏各自滚动，外层不滚动 */
.itw-panels :deep(.p-tabpanel) {
  height: 100%;
}

/* 对话标签：对话面板自己滚动，输入框贴底，不留内边距 */
.itw-tabs :deep(.itw-panels--chat) {
  padding: 0;
  overflow: hidden;
}

.itw-panels--chat :deep(.p-tabpanel) {
  display: flex;
  flex-direction: column;
}

.itw-draft {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.itw-draft--split {
  height: 100%;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.itw-draft--split > * {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.itw-preview {
  padding: 0.9rem 1rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

@media (max-width: 1100px) {
  .itw-draft--split {
    height: auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }

  .itw-draft--split > * {
    overflow: visible;
  }
}
</style>
