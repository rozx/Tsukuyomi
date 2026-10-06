<template>
  <MobileBottomSheet v-if="isMobile" v-model:visible="visible" :title="title">
    <template v-if="$slots.header" #header="{ close }">
      <div class="adaptive-drawer-sheet-header">
        <slot name="header" :close="close" />
      </div>
    </template>
    <slot />
  </MobileBottomSheet>

  <Drawer
    v-else
    v-model:visible="visible"
    position="right"
    :show-close-icon="!$slots.header"
    :aria-label="title"
    v-bind="$attrs"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" :close="() => (visible = false)" />
    </template>
    <slot />
  </Drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Drawer from 'primevue/drawer';
import MobileBottomSheet from './MobileBottomSheet.vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';

/** 内容与打开状态共享，只按布局切换侧滑抽屉或标准手机底部抽屉。 */
defineOptions({ inheritAttrs: false });
defineProps<{ title: string }>();
const visible = defineModel<boolean>('visible', { required: true });
const { variant } = useDeviceVariant();
const isMobile = computed(() => variant.value === 'mobile');
</script>

<style scoped>
.adaptive-drawer-sheet-header {
  width: 100%;
  padding: 6px 14px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
}
</style>
