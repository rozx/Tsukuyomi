<script setup lang="ts">
/**
 * 手机导入工作台：分段切换任务／对话／来源／草稿／方案，章节正文检查以整屏替代列表。
 * 月詠对话是常驻分区（打开任务默认停在对话）；底部栏的「月詠」在导入路由下切到该分区。
 */
import { computed, watch } from 'vue';
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

const sections: { id: ImportSection; label: string }[] = [
  { id: 'tasks', label: '任务' },
  { id: 'chat', label: '对话' },
  { id: 'sources', label: '来源' },
  { id: 'draft', label: '草稿' },
  { id: 'plan', label: '方案' },
];

// 没有选中任务时只显示任务分区
const current = computed<ImportSection>(() => (store.task ? ctx.section.value : 'tasks'));
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
  <div class="ipm" :class="{ 'ipm--chat': current === 'chat' }">
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

    <div v-if="current === 'chat'" class="ipm-chat">
      <ImportChatPanel />
    </div>
    <div v-else class="ipm-body">
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
  grid-template-columns: repeat(5, 1fr);
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

.ipm--chat {
  height: 100%;
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
