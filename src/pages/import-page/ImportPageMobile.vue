<script setup lang="ts">
/**
 * 手机导入工作台：分两层——
 * - 任务列表：未打开任务时整页显示（返回 + 标题 + 任务列表），选择或新建任务后进入任务；
 *   导入页不在底部栏，返回回到进入前的页面（直接打开时回到首页）；
 * - 任务内：按「来源 → 整理 → 导入」三步引导（见 ImportMobileTask）。
 * 对话不占页面：任务顶部的月詠预览与底部栏「月詠」打开同一个导入对话抽屉（挂在手机布局上）。
 */
import { useI18n } from 'vue-i18n';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportMobileTask from 'src/components/import/ImportMobileTask.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';

const ctx = injectImportPage();
const store = useImportWorkspaceStore();
const { t } = useI18n();
</script>

<template>
  <div v-if="!store.task" class="ipm">
    <header class="ipm-head">
      <button
        type="button"
        class="ui-btn ui-btn--ghost ui-btn--icon ipm-back"
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

  <ImportMobileTask v-else />
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

.ipm-back {
  flex-shrink: 0;
}

.ipm-back i {
  font-size: 13px;
}

.ipm-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 14px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
}
</style>
