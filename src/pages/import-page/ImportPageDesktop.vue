<script setup lang="ts">
/**
 * 桌面导入工作台：统一页头，下方左侧为常驻的任务列表栏，右侧为当前任务的工作区
 * （运行条 + 来源／卷章草稿／导入方案）；月詠对话由布局右栏的导入聊天外壳常驻承载。
 */
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import ImportPageHeader from 'src/components/import/ImportPageHeader.vue';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportTaskWorkspace from 'src/components/import/ImportTaskWorkspace.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const { t } = useI18n();
</script>

<template>
  <div class="ipd">
    <ImportPageHeader />

    <div class="ipd-body">
      <aside class="ipd-tasks">
        <ImportTaskList />
      </aside>

      <main class="ipd-work">
        <ImportTaskWorkspace v-if="store.task" />
        <div v-else class="ipd-empty">
          <i class="pi pi-file-import ipd-empty-icon" aria-hidden="true" />
          <h2 class="ipd-empty-title">{{ t('importUi.page.title') }}</h2>
          <p class="ipd-empty-text">{{ t('importUi.page.intro') }}</p>
          <Button icon="pi pi-plus" :label="t('importUi.page.create')" @click="ctx.createTask" />
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

/* 页头下方：任务列表栏 + 工作区 */
.ipd-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
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

/* 未选任务 */
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
</style>
