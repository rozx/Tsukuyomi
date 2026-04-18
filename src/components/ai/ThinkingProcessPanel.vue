<script setup lang="ts">
/**
 * AI 思考过程面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `ThinkingProcessBody`。
 */
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import ThinkingProcessBody from './ThinkingProcessBody.vue';

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const mobileVisible = ref(false);
const popoverVisible = ref(false);

const active = computed(() => (isPhone.value ? mobileVisible.value : popoverVisible.value));

const popoverStyle = computed(() => ({
  width: 'min(32rem, 94vw)',
  maxHeight: 'min(600px, 82dvh)',
}));

const handlePopoverShow = () => {
  popoverVisible.value = true;
};
const handlePopoverHide = () => {
  popoverVisible.value = false;
};

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
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    :style="popoverStyle"
    class="thinking-popover"
    @show="handlePopoverShow"
    @hide="handlePopoverHide"
  >
    <ThinkingProcessBody :active="active" list-max-height="500px" />
  </Popover>

  <MobileBottomSheet
    v-else
    v-model:visible="mobileVisible"
    title="AI 思考过程"
    eyebrow="ACTIVE TASKS"
    max-height="86dvh"
  >
    <ThinkingProcessBody :active="active" list-max-height="58dvh" />
  </MobileBottomSheet>
</template>

<style scoped>
.thinking-popover :deep(.p-popover-content) {
  padding: 1rem;
}
</style>
