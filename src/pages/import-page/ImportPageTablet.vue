<script setup lang="ts">
/**
 * 平板导入工作台：分两层——
 * - 任务列表：未打开任务时整页显示，选择或新建任务后进入任务；
 * - 任务内：页头左上「全部任务」返回列表，下方按「来源 → 整理 → 导入」三步引导。
 * 横屏时月詠对话停靠在布局右栏；竖屏宽度不够停靠，任务顶部显示月詠预览，点开右侧滑入的对话面板。
 */
import ImportPageHeader from 'src/components/import/ImportPageHeader.vue';
import ImportTaskList from 'src/components/import/ImportTaskList.vue';
import ImportTaskWorkspace from 'src/components/import/ImportTaskWorkspace.vue';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { usePortrait } from 'src/composables/usePortrait';

const store = useImportWorkspaceStore();
const portrait = usePortrait();
</script>

<template>
  <div class="ipt">
    <ImportPageHeader :show-back="!!store.task" />
    <ImportTaskWorkspace v-if="store.task" :chat-preview="portrait" />
    <div v-else class="ipt-list">
      <ImportTaskList navigable />
    </div>
  </div>
</template>

<style scoped>
.ipt {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ipt-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 32px 28px;
}

.ipt-list > :deep(*) {
  max-width: 760px;
}
</style>
