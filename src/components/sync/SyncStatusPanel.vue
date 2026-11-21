<script setup lang="ts">
/**
 * 同步状态面板 —— 桌面走 PrimeVue Popover，手机走 MobileBottomSheet。
 * 两种形态共享同一个 `SyncStatusBody`（内容 + 状态），只在外壳上做切换。
 *
 * 调用方（AppHeader / MobileSysBar）仍然通过 `ref.value.toggle(event)` 开关面板。
 */
import { provide } from 'vue';
import Popover from 'primevue/popover';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import SyncStatusBody from './SyncStatusBody.vue';
import { SyncPanelCloseKey } from './sync-panel-injection';
import { useHeaderPopover } from 'src/composables/useHeaderPopover';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const { isPhone, popoverRef, mobileVisible, toggle, close, centerArrow } =
  useHeaderPopover('sync-popover');

// 供子组件（SyncStatusBody）在弹出确认对话框前关闭本面板
provide(SyncPanelCloseKey, close);

defineExpose({ toggle, close });
</script>

<template>
  <!-- 桌面：Popover 贴在触发按钮旁 -->
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    class="anchored-popover header-popover sync-popover"
    @show="centerArrow"
  >
    <SyncStatusBody />
  </Popover>

  <!-- 手机：底部抽屉 -->
  <MobileBottomSheet
    v-else
    v-model:visible="mobileVisible"
    :title="t('syncUi.panel.title')"
    eyebrow="CLOUD · GIST"
  >
    <SyncStatusBody />
  </MobileBottomSheet>
</template>
