<script setup lang="ts">
/**
 * 消息历史面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `ToastHistoryBody`。
 */
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useUiStore } from 'src/stores/ui';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import ToastHistoryBody from './ToastHistoryBody.vue';

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

const { markAsRead } = useToastHistory();

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const mobileVisible = ref(false);

const popoverStyle = computed(() => ({
  width: 'min(500px, 94vw)',
  maxHeight: 'min(600px, 82dvh)',
}));

// 面板被打开时（两种形态都适用）标记消息为已读
const handleShown = () => {
  void markAsRead();
};

defineExpose({
  toggle: (event: Event) => {
    if (isPhone.value) {
      const willOpen = !mobileVisible.value;
      mobileVisible.value = willOpen;
      if (willOpen) handleShown();
    } else {
      popoverRef.value?.toggle(event);
    }
  },
});
</script>

<template>
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    :style="popoverStyle"
    class="toast-history-overlay"
    @show="handleShown"
  >
    <ToastHistoryBody />
  </Popover>

  <MobileBottomSheet
    v-else
    v-model:visible="mobileVisible"
    title="消息历史"
    eyebrow="NOTIFICATIONS"
    max-height="86dvh"
  >
    <ToastHistoryBody />
  </MobileBottomSheet>
</template>

<style scoped>
.toast-history-overlay :deep(.p-popover-content) {
  padding: 1rem;
}
</style>
