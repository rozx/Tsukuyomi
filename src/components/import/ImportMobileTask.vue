<script setup lang="ts">
/**
 * 手机导入任务：按「来源 → 整理 → 导入」三步引导。
 * - 顶部：返回任务列表 + 任务名（可直接改名）、月詠预览（点开对话抽屉）、三步进度（可点选查看任一步）；
 * - 正文：当前查看的那一步（来源列表、卷章草稿、导入方案），上方只保留需要注意的提示；
 * - 底部：这一步唯一的主按钮，贴在底部栏上方；导入方案页自带确认导入。
 */
import { useI18n } from 'vue-i18n';
import ImportRunNotices from './ImportRunNotices.vue';
import ImportSourcePanel from './ImportSourcePanel.vue';
import ImportDraftPanel from './ImportDraftPanel.vue';
import ImportChapterPreview from './ImportChapterPreview.vue';
import ImportPlanPanel from './ImportPlanPanel.vue';
import ImportAssistantPreview from './ImportAssistantPreview.vue';
import ImportStepBar from './ImportStepBar.vue';
import ImportStepFooter from './ImportStepFooter.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportFlow } from 'src/composables/import-page/useImportFlow';
import { useImportTaskName } from 'src/composables/import-page/useImportTaskName';

const ctx = injectImportPage();
const { t } = useI18n();
const { name, save: saveName } = useImportTaskName();
const { current } = useImportFlow();
</script>

<template>
  <div class="imt">
    <header class="imt-head">
      <div class="imt-title-row">
        <button
          type="button"
          class="ui-btn ui-btn--ghost ui-btn--icon imt-back"
          :title="t('importUi.page.allTasks')"
          :aria-label="t('importUi.page.allTasks')"
          @click="ctx.closeTask()"
        >
          <i class="pi pi-chevron-left" aria-hidden="true" />
        </button>
        <input
          v-model="name"
          class="imt-name"
          :aria-label="t('importUi.runBar.name')"
          maxlength="80"
          @blur="saveName"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>
      <ImportAssistantPreview />
      <ImportStepBar />
    </header>

    <div class="imt-body">
      <ImportRunNotices />
      <ImportSourcePanel v-if="current === 'sources'" list-first />
      <template v-else-if="current === 'draft'">
        <ImportChapterPreview v-if="ctx.selectedChapterId.value" />
        <ImportDraftPanel v-else structure-first />
      </template>
      <ImportPlanPanel v-else />
    </div>

    <ImportStepFooter class="imt-footer" />
  </div>
</template>

<style scoped>
/* 至少占满顶栏与底部栏之间：内容较短时，主按钮也贴在底部 */
.imt {
  min-height: calc(100dvh - var(--mobile-sysbar-height, 0px) - var(--mobile-tabbar-height, 0px));
  display: flex;
  flex-direction: column;
}

/* ───────────── 顶部：任务名、月詠预览、三步进度 ───────────── */
.imt-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.imt-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.imt-back {
  flex-shrink: 0;
}

.imt-back i {
  font-size: 13px;
}

/* 任务名：看起来是标题，点进去可以直接改 */
.imt-name {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  outline: none;
}

.imt-name:focus {
  border-color: var(--white-opacity-12, rgba(255, 255, 255, 0.12));
  background: var(--white-opacity-4);
}

/* ───────────── 正文与底部主按钮 ───────────── */
.imt-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 14px 16px 24px;
}

.imt-footer {
  position: sticky;
  bottom: var(--mobile-tabbar-height, 0px);
  z-index: 5;
}
</style>
