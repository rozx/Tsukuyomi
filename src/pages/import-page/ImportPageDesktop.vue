<script setup lang="ts">
/**
 * 桌面导入工作台：左侧任务列表，中间为来源／卷章草稿／导入方案，
 * 月詠对话由布局右栏的导入聊天外壳承载（绑定当前任务）。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportRunBar from 'src/components/import/ImportRunBar.vue';
import ImportSourcePanel from 'src/components/import/ImportSourcePanel.vue';
import ImportDraftPanel from 'src/components/import/ImportDraftPanel.vue';
import ImportChapterPreview from 'src/components/import/ImportChapterPreview.vue';
import ImportPlanPanel from 'src/components/import/ImportPlanPanel.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';

const ctx = injectImportPage();
const store = ctx.store;

// 桌面不单独显示「任务」分区：任务列表常驻左侧
const tab = computed({
  get: () => (ctx.section.value === 'tasks' ? 'draft' : ctx.section.value),
  set: (value: string) => {
    ctx.section.value = value as typeof ctx.section.value;
  },
});
const sourceCount = computed(() => store.sources.length);
const chapterCount = computed(() => store.task?.draft.chapters.length ?? 0);
</script>

<template>
  <div class="ipd">
    <aside class="ipd-tasks">
      <DesktopWorkbenchSurface class="ipd-surface">
        <ImportTaskList />
      </DesktopWorkbenchSurface>
    </aside>

    <main class="ipd-work">
      <DesktopWorkbenchSurface v-if="!store.task" class="ipd-surface ipd-empty">
        <i class="pi pi-file-import ipd-empty-icon" aria-hidden="true" />
        <h1 class="ipd-empty-title">AI 导入</h1>
        <p class="ipd-empty-text">
          提供小说网址、TXT / Markdown / HTML / EPUB 文件或整个文件夹，由月詠检查来源、提取正文、
          整理卷章。你可以随时修改草稿，确认导入方案后才会写入书库，之后在没有后续修改前可以撤销。
        </p>
        <Button icon="pi pi-plus" label="新建导入任务" @click="ctx.createTask" />
      </DesktopWorkbenchSurface>

      <DesktopWorkbenchSurface v-else class="ipd-surface ipd-main">
        <ImportRunBar />
        <Tabs v-model:value="tab" class="ipd-tabs">
          <TabList>
            <Tab value="sources">来源（{{ sourceCount }}）</Tab>
            <Tab value="draft">卷章草稿（{{ chapterCount }}）</Tab>
            <Tab value="plan">导入方案</Tab>
          </TabList>
          <TabPanels class="ipd-panels">
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
      </DesktopWorkbenchSurface>
    </main>
  </div>
</template>

<style scoped>
.ipd {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
  gap: 1rem;
  padding: 1rem 1.1rem 1.25rem;
  min-height: 0;
}

.ipd-tasks,
.ipd-work {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipd-surface {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipd-main {
  gap: 0.75rem;
}

.ipd-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipd-tabs :deep(.p-tabpanels) {
  background: transparent;
  padding: 0.9rem 0 0;
}

.ipd-panels {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.ipd-draft {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.ipd-draft--split {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
}

.ipd-preview {
  position: sticky;
  top: 0;
  align-self: start;
  max-height: calc(100vh - 14rem);
  overflow-y: auto;
  padding: 0.75rem;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.ipd-empty {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.9rem;
}

.ipd-empty-icon {
  font-size: 2.4rem;
  color: rgb(165, 180, 252);
}

.ipd-empty-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.ipd-empty-text {
  max-width: 34rem;
  font-size: 0.85rem;
  line-height: 1.8;
  color: rgba(226, 232, 240, 0.65);
  margin: 0;
}

@media (max-width: 1100px) {
  .ipd-draft--split {
    grid-template-columns: minmax(0, 1fr);
  }

  .ipd-preview {
    position: static;
    max-height: none;
  }
}
</style>
