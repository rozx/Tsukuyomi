<script setup lang="ts">
/**
 * 已打开的导入任务的工作区（桌面与平板共用），按「来源 → 整理 → 导入」三步引导：
 * 顶部是运行条（任务名、状态、章节进度与提示）与三步进度，中间是正在查看的那一步，
 * 底部是这一步的主按钮（让月詠整理 / 暂停 / 生成导入方案；导入方案页自带确认导入）。
 * chatPreview：对话没有停靠在旁边时（平板竖屏）显示月詠预览，点开右侧滑入的对话面板。
 * 正在查看的一步存在页面 composable 的 section 里，断点或横竖屏切换后保留。
 */
import ImportRunBar from './ImportRunBar.vue';
import ImportSourcePanel from './ImportSourcePanel.vue';
import ImportDraftPanel from './ImportDraftPanel.vue';
import ImportChapterPreview from './ImportChapterPreview.vue';
import ImportPlanPanel from './ImportPlanPanel.vue';
import ImportAssistantPreview from './ImportAssistantPreview.vue';
import ImportStepBar from './ImportStepBar.vue';
import ImportStepFooter from './ImportStepFooter.vue';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import { useImportFlow } from 'src/composables/import-page/useImportFlow';

withDefaults(defineProps<{ chatPreview?: boolean }>(), { chatPreview: false });
const ctx = injectImportPage();
const { current } = useImportFlow();
</script>

<template>
  <div class="itw">
    <div class="itw-top">
      <ImportRunBar />
      <ImportAssistantPreview v-if="chatPreview" />
      <ImportStepBar />
    </div>

    <div class="itw-body">
      <ImportSourcePanel v-if="current === 'sources'" list-first />
      <div
        v-else-if="current === 'draft'"
        class="itw-draft"
        :class="{ 'itw-draft--split': ctx.selectedChapterId.value }"
      >
        <ImportDraftPanel structure-first />
        <div v-if="ctx.selectedChapterId.value" class="itw-preview">
          <ImportChapterPreview />
        </div>
      </div>
      <ImportPlanPanel v-else />
    </div>

    <ImportStepFooter class="itw-footer" />
  </div>
</template>

<style scoped>
.itw {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.itw-top {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 28px 14px;
  border-bottom: 1px solid var(--white-opacity-6);
}

/* 正在查看的那一步：在这里滚动，主按钮固定在底部 */
.itw-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 28px 24px;
}

.itw-footer {
  flex-shrink: 0;
}

.itw-draft {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

/* 并排检查章节正文时左右两栏各自滚动，外层不滚动 */
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
