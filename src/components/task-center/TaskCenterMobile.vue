<script setup lang="ts">
/**
 * 手机任务中心：点击 chip 打开底部抽屉；点击任务行打开该任务的全屏详情（与桌面共用详情视图）。
 * 手机端不提供固定与收起（固定状态保留，回到桌面断点时恢复）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import TaskCenterBody from './TaskCenterBody.vue';
import TaskCenterDetailView from './TaskCenterDetailView.vue';

const { t } = useI18n();
const center = injectTaskCenter();

const sheetVisible = ref(false);
/**
 * 全屏详情只在本次点击任务行后打开：保存的详情 ID（例如从桌面断点切换过来、刷新）不会自动弹出。
 * 任务被移出队列 / 清理后 detail 变为空，详情随之关闭。
 */
const detailOpened = ref(false);
const detailVisible = computed({
  get: () => detailOpened.value && center.detail.value !== null,
  set: (open: boolean) => {
    if (open) return;
    detailOpened.value = false;
    center.closeDetail();
  },
});

const openDetail = () => {
  detailOpened.value = true;
};

const setSheetVisible = (open: boolean) => {
  sheetVisible.value = open;
  center.setOpen(open);
};

onMounted(() => {
  center.registerOpener(() => setSheetVisible(!sheetVisible.value));
});
onUnmounted(() => {
  center.registerOpener(null);
  // 断点切换卸载本变体时抽屉随之消失，但不会发出关闭事件：清掉共享的打开标记，
  // 否则桌宠、center.open() 与向量化区都会以为任务中心还在屏幕上
  center.setOpen(false);
});
</script>

<template>
  <MobileBottomSheet
    :visible="sheetVisible"
    :title="t('taskQueueUi.title')"
    min-height="50dvh"
    full-bleed
    @update:visible="setSheetVisible"
  >
    <TaskCenterBody mode="sheet" @open-detail="openDetail" />
  </MobileBottomSheet>

  <MobileBottomSheet
    v-model:visible="detailVisible"
    :title="t('taskQueueUi.detailTitle')"
    min-height="100dvh"
    max-height="100dvh"
    full-bleed
  >
    <TaskCenterDetailView mode="sheet" class="tc-mobile-detail" />
  </MobileBottomSheet>
</template>

<style scoped>
/* 抽屉是全出血的（正文不滚动）：详情视图自己滚动（.tc-dv 的 overflow-y: auto）；日志区至少占大半屏 */
.tc-mobile-detail {
  --tc-log-min-height: 62dvh;
  overscroll-behavior: contain;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
