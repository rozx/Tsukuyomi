<script setup lang="ts">
/**
 * 手机导入工作台：分段切换任务／来源／草稿／方案，章节正文检查以整屏替代列表；
 * 月詠对话通过底部栏的「月詠」打开导入聊天抽屉（绑定当前任务）。
 */
import { computed } from 'vue';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportRunBar from 'src/components/import/ImportRunBar.vue';
import ImportSourcePanel from 'src/components/import/ImportSourcePanel.vue';
import ImportDraftPanel from 'src/components/import/ImportDraftPanel.vue';
import ImportChapterPreview from 'src/components/import/ImportChapterPreview.vue';
import ImportPlanPanel from 'src/components/import/ImportPlanPanel.vue';
import { injectImportPage, type ImportSection } from 'src/composables/import-page/useImportPage';

const ctx = injectImportPage();
const store = ctx.store;

const sections: { id: ImportSection; label: string }[] = [
  { id: 'tasks', label: '任务' },
  { id: 'sources', label: '来源' },
  { id: 'draft', label: '草稿' },
  { id: 'plan', label: '方案' },
];

// 没有选中任务时只显示任务分区
const current = computed<ImportSection>(() => (store.task ? ctx.section.value : 'tasks'));
const select = (id: ImportSection) => {
  ctx.section.value = id;
};
</script>

<template>
  <div class="ipm">
    <nav class="ipm-seg" aria-label="导入工作台分区">
      <button
        v-for="item in sections"
        :key="item.id"
        type="button"
        class="ipm-seg-btn"
        :class="{ 'ipm-seg-btn--active': current === item.id }"
        :disabled="item.id !== 'tasks' && !store.task"
        :aria-pressed="current === item.id"
        @click="select(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <div class="ipm-body">
      <ImportTaskList v-if="current === 'tasks'" />
      <template v-else>
        <ImportRunBar />
        <ImportSourcePanel v-if="current === 'sources'" />
        <template v-else-if="current === 'draft'">
          <ImportChapterPreview v-if="ctx.selectedChapterId.value" />
          <ImportDraftPanel v-else />
        </template>
        <ImportPlanPanel v-else />
      </template>
    </div>
  </div>
</template>

<style scoped>
.ipm {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.ipm-seg {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 10px 16px;
  background: rgba(10, 12, 15, 0.86);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ipm-seg-btn {
  min-height: 36px;
  border-radius: 10px;
  font-size: 0.82rem;
  color: rgba(226, 232, 240, 0.65);
}

.ipm-seg-btn--active {
  background: rgba(99, 102, 241, 0.2);
  color: rgb(224, 231, 255);
  font-weight: 600;
}

.ipm-seg-btn:disabled {
  opacity: 0.35;
}

.ipm-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 14px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
}
</style>
