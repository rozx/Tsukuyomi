<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

import { computed } from 'vue';
import Button from 'primevue/button';
import { useSystemBar } from 'src/composables/layout/useSystemBar';
import ToastHistoryDialog from 'src/components/dialogs/ToastHistoryDialog.vue';
import SyncStatusPanel from 'src/components/sync/SyncStatusPanel.vue';
import TaskCenterChip from 'src/components/task-center/TaskCenterChip.vue';
import NotificationBadge from 'src/components/layout/NotificationBadge.vue';
import { useAssistantToggle } from 'src/composables/layout/useAssistantToggle';
import { usePortrait } from 'src/composables/usePortrait';
import { APP_NAME } from 'src/constants/app';
import { APP_DISPLAY_VERSION } from 'src/constants/build-info';

const {
  unreadCount,
  pendingCount,
  syncState,
  toastHistoryRef,
  syncPanelRef,
  toggleHistory,
  toggleSync,
} = useSystemBar();

// 月詠助手：导入页横屏对话常驻停靠（按钮只显示激活态），竖屏改为右侧滑入面板（照常开关）
const portrait = usePortrait();
const assistant = useAssistantToggle({ importDocked: () => !portrait.value });

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
    <!-- 页面开关挂载点：书库页 / 书籍详情页把左侧列表、目录开关 Teleport 进来（TabletSysbarToggle）；
         其他页面为空，display: contents 让它不占宽度 -->
    <div id="tablet-sysbar-leading" class="tst-leading" />

    <div class="tst-brand">
      <span class="tst-brand-name">{{ APP_NAME.en }} {{ APP_NAME.zh }} · MOONLIT TRANSLATOR</span>
      <span class="tst-brand-version">v{{ APP_DISPLAY_VERSION }}</span>
    </div>

    <div class="tst-actions">
      <!-- 任务中心（合并原「AI 思考」入口） -->
      <TaskCenterChip chip-class="system-bar-chip tst-chip" pill-class="pill thinking" />

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

      <!-- 月詠助手：分隔线之后、通知之前，只显示图标 -->
      <button
        type="button"
        class="system-bar-chip tst-chip tst-icon-chip"
        :class="{ active: assistant.active.value }"
        :aria-label="i18nT('libraryUi.assistantLabel')"
        :aria-pressed="assistant.active.value"
        :title="i18nT('libraryUi.assistantLabel')"
        @click="assistant.toggle"
      >
        <i class="pi pi-comments" aria-hidden="true" />
      </button>

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

.tst-leading {
  display: contents;
}

.tst-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tst-icon-chip {
  width: 32px;
  padding: 0;
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
