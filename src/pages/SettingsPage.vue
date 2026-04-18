<script setup lang="ts">
/**
 * Dispatcher for the /settings page. Replaces the previous SettingsDialog
 * popup — settings is now a routed page so breakpoint swaps, back/forward,
 * and deep-linking work like any other route. Variants follow the uniform
 * Desktop / Tablet / Mobile pattern via `useDeviceVariant`.
 */
import { computed } from 'vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import Button from 'primevue/button';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideSettingsPage } from 'src/composables/settings-page/useSettingsPage';
import SettingsPageDesktop from './settings-page/SettingsPageDesktop.vue';
import SettingsPageTablet from './settings-page/SettingsPageTablet.vue';
import SettingsPageMobile from './settings-page/SettingsPageMobile.vue';

const ctx = provideSettingsPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return SettingsPageMobile;
    case 'tablet':
      return SettingsPageTablet;
    case 'desktop':
    default:
      return SettingsPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />

  <!-- 首次使用提示 Toast (共享，由 composable 触发) -->
  <Toast group="memory-intro" position="top-center">
    <template #message="slotProps">
      <div class="flex flex-col gap-2 w-full">
        <div>
          <p class="text-sm font-medium">{{ slotProps.message.summary }}</p>
          <p class="text-xs text-moon/70 mt-1">{{ slotProps.message.detail }}</p>
        </div>
        <div class="flex gap-2 justify-end">
          <Button label="了解更多" size="small" @click="ctx.handleIntroLearnMore" />
          <Button
            label="稍后"
            size="small"
            severity="secondary"
            text
            @click="ctx.dismissIntro"
          />
        </div>
      </div>
    </template>
  </Toast>

  <!-- 供设置 tab 内部操作使用的确认对话框 -->
  <ConfirmDialog group="settings" />
</template>
