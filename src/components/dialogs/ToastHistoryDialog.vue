<script setup lang="ts">
/**
 * 消息历史面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `ToastHistoryBody`。
 */
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Popover from 'primevue/popover';
import { useToastHistory } from 'src/composables/useToastHistory';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import ToastHistoryBody from './ToastHistoryBody.vue';
import { useHeaderPopover } from 'src/composables/useHeaderPopover';

const { t } = useI18n();

const { markAsRead } = useToastHistory();

// 桌面 Popover（箭头对准 chip，宽高由 header 弹层外壳统一）/ 手机底部抽屉
const { isPhone, popoverRef, mobileVisible, toggle, centerArrow } =
  useHeaderPopover('toast-history-overlay');

// 面板被打开时（两种形态都适用）标记消息为已读
const handleShown = () => {
  void markAsRead();
};
const handlePopoverShown = () => {
  centerArrow();
  handleShown();
};

// 无论 mobileVisible 以何种方式变为 true（toggle()、v-model、父级 ref 驱动），
// 都触发 markAsRead；避免将"打开即已读"逻辑绑死在某一条调用路径上。
watch(mobileVisible, (visible, wasVisible) => {
  if (visible && !wasVisible) handleShown();
});

defineExpose({ toggle });
</script>

<template>
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    class="anchored-popover header-popover toast-history-overlay"
    @show="handlePopoverShown"
  >
    <ToastHistoryBody />
  </Popover>

  <MobileBottomSheet
    v-else
    v-model:visible="mobileVisible"
    :title="t('activityUi.toastHistory.title')"
    eyebrow="NOTIFICATIONS"
    max-height="86dvh"
  >
    <ToastHistoryBody />
  </MobileBottomSheet>
</template>
