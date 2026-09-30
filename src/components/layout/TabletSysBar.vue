<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

import { computed } from 'vue';
import Button from 'primevue/button';
import { useSystemBar } from 'src/composables/layout/useSystemBar';
import ToastHistoryDialog from 'src/components/dialogs/ToastHistoryDialog.vue';
import SyncStatusPanel from 'src/components/sync/SyncStatusPanel.vue';
import ThinkingProcessPanel from 'src/components/ai/ThinkingProcessPanel.vue';
import NotificationBadge from 'src/components/layout/NotificationBadge.vue';
import { APP_NAME } from 'src/constants/app';
import { APP_VERSION } from 'src/constants/version';

const {
  unreadCount,
  pendingCount,
  syncState,
  thinking,
  toastHistoryRef,
  thinkingPanelRef,
  syncPanelRef,
  toggleHistory,
  toggleThinking,
  toggleSync,
} = useSystemBar();

// 同步态徽章收敛为单个描述对象，渲染成同一个 <button>。
// 弹层（PrimeVue Popover）以触发按钮为定位锚点，且内容尺寸变化时会重新对齐；
// 若用 v-if 在多个按钮间切换，原锚点按钮被卸载后弹层会跳到屏幕左上角。
const syncChip = computed(() => {
  switch (syncState.value) {
    case 'syncing':
      return {
        class: 'system-bar-chip tst-chip pill sync-pending',
        icon: 'pi pi-spin pi-spinner',
        label: i18nT('libraryUi.syncing'),
        labelClass: '',
        aria: i18nT('libraryUi.syncing'),
      };
    case 'changes':
      return {
        class: 'system-bar-chip tst-chip pill sync-changes',
        icon: 'pi pi-cloud-upload',
        label: i18nT('libraryUi.changes', { count: pendingCount.value }),
        labelClass: '',
        aria: i18nT('libraryUi.changes', { count: pendingCount.value }),
      };
    case 'ok':
      return {
        class: 'system-bar-chip tst-chip pill sync-ok',
        icon: 'pi pi-cloud-check',
        label: i18nT('libraryUi.synced'),
        labelClass: '',
        aria: i18nT('libraryUi.synced'),
      };
    default:
      return {
        class: 'system-bar-chip tst-chip',
        icon: 'pi pi-cloud',
        label: i18nT('libraryUi.sync'),
        labelClass: 'tst-chip-label',
        aria: i18nT('libraryUi.syncStatus'),
      };
  }
});
</script>

<template>
  <div class="tsm-sysbar-tablet">
    <div class="tst-brand">
      <span class="tst-brand-name">{{ APP_NAME.en }} {{ APP_NAME.zh }} · MOONLIT TRANSLATOR</span>
      <span class="tst-brand-version">v{{ APP_VERSION }}</span>
    </div>

    <div class="tst-actions">
      <!-- AI thinking：单个持久按钮（作为弹层锚点不可被 v-if 卸载），内部内容随状态切换 -->
      <button
        type="button"
        class="system-bar-chip tst-chip"
        :class="{ 'pill thinking': thinking }"
        data-testid="tst-thinking-chip"
        :aria-label="i18nT('libraryUi.thinkingProcess')"
        @click="toggleThinking"
      >
        <template v-if="thinking">
          <span class="tst-dot" />
          <span>{{ i18nT('libraryUi.aiThinkingActive') }}</span>
        </template>
        <template v-else>
          <i class="pi pi-sparkles" aria-hidden="true" />
          <span class="tst-chip-label">{{ i18nT('libraryUi.thinkingProcess') }}</span>
        </template>
      </button>

      <!-- Sync：同上，单个持久按钮，外观由 syncChip 描述对象驱动 -->
      <button
        type="button"
        :class="syncChip.class"
        data-testid="tst-sync-chip"
        :aria-label="syncChip.aria"
        @click="toggleSync"
      >
        <i :class="syncChip.icon" aria-hidden="true" />
        <span :class="syncChip.labelClass">{{ syncChip.label }}</span>
      </button>

      <div class="tst-sep" />

      <!-- Notifications -->
      <button
        type="button"
        class="system-bar-chip tst-chip"
        :aria-label="i18nT('libraryUi.notifications')"
        @click="toggleHistory"
      >
        <i class="pi pi-bell" aria-hidden="true" />
        <NotificationBadge v-if="unreadCount > 0">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </NotificationBadge>
      </button>
    </div>

    <!-- Popovers (mounted to body by PrimeVue) -->
    <ToastHistoryDialog ref="toastHistoryRef" />
    <SyncStatusPanel ref="syncPanelRef" />
    <ThinkingProcessPanel ref="thinkingPanelRef" />

    <!-- Button refs used by PrimeVue popovers -->
    <Button v-show="false" />
  </div>
</template>

<style scoped>
.tsm-sysbar-tablet {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: rgba(8, 10, 13, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  position: relative;
  z-index: 6;
  min-height: 44px;
}

.tst-brand {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  line-height: 1.1;
}

.tst-brand-name {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgba(155, 164, 179, 0.85);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tst-brand-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 400;
  color: rgba(174, 183, 198, 0.32);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tst-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tst-chip i {
  font-size: 13px;
  line-height: 1;
}

.tst-chip-label {
  font-size: 11px;
}

.tst-chip:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
}

.tst-chip.active {
  background: rgba(109, 136, 168, 0.14);
  color: #bac9db;
  border-color: rgba(109, 136, 168, 0.28);
}

.tst-chip.pill {
  padding: 0 10px 0 9px;
  background: rgba(109, 136, 168, 0.1);
  border-color: rgba(109, 136, 168, 0.22);
  color: #bac9db;
}

.tst-chip.pill.thinking {
  background: rgba(140, 165, 195, 0.12);
  border-color: rgba(140, 165, 195, 0.28);
  color: #c9d8ea;
}

.tst-chip.pill.thinking i {
  color: #a3b7cf;
}

.tst-chip.pill.sync-ok {
  background: rgba(167, 209, 176, 0.1);
  border-color: rgba(167, 209, 176, 0.25);
  color: #b9d9c1;
}

.tst-chip.pill.sync-ok i {
  color: #a7d1b0;
}

.tst-chip.pill.sync-pending {
  background: rgba(234, 192, 123, 0.1);
  border-color: rgba(234, 192, 123, 0.25);
  color: #e8c78a;
}

.tst-chip.pill.sync-changes {
  background: rgba(234, 192, 123, 0.12);
  border-color: rgba(234, 192, 123, 0.3);
  color: #e8c78a;
}

.tst-chip.pill.sync-changes i {
  color: #e8c78a;
}

.tst-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a3b7cf;
  box-shadow: 0 0 8px #a3b7cf;
  animation: tst-pulse 1.6s ease-in-out infinite;
}

@keyframes tst-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.tst-sep {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 4px;
}

@media (max-width: 900px) {
  .tst-chip-label {
    display: none;
  }
}
</style>
