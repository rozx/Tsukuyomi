<script setup lang="ts">
/**
 * 同步状态面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `SyncStatusBody`（内容 + 状态），只在外壳上做切换。
 *
 * 调用方（AppHeader / MobileSysBar）仍然通过 `ref.value.toggle(event)` 开关面板。
 */
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import SyncStatusBody from './SyncStatusBody.vue';

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const mobileVisible = ref(false);

defineExpose({
  toggle: (event: Event) => {
    if (isPhone.value) {
      mobileVisible.value = !mobileVisible.value;
    } else {
      popoverRef.value?.toggle(event);
    }
  },
});
</script>

<template>
  <!-- 桌面：Popover 贴在触发按钮旁 -->
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 300px"
    class="sync-popover"
  >
    <SyncStatusBody />
  </Popover>

  <!-- 手机：底部抽屉 -->
  <MobileBottomSheet
    v-else
    v-model:visible="mobileVisible"
    title="同步状态"
    eyebrow="CLOUD · GIST"
  >
    <SyncStatusBody />
  </MobileBottomSheet>
</template>

<style scoped>
.sync-popover :deep(.p-popover-content) {
  padding: 1rem;
}
</style>
