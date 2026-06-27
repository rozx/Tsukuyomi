<script setup lang="ts">
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
</script>

<template>
  <div class="tsm-sysbar-tablet">
    <div class="tst-brand">
      <span class="tst-brand-name">{{ APP_NAME.en }} {{ APP_NAME.zh }} · MOONLIT TRANSLATOR</span>
      <span class="tst-brand-version">v{{ APP_VERSION }}</span>
    </div>

    <div class="tst-actions">
      <!-- AI thinking -->
      <button
        v-if="thinking"
        type="button"
        class="tst-chip pill thinking"
        aria-label="AI 思考过程"
        @click="toggleThinking"
      >
        <span class="tst-dot" />
        <span>AI 思考中</span>
      </button>
      <button
        v-else
        type="button"
        class="tst-chip"
        aria-label="AI 思考过程"
        @click="toggleThinking"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
        <span class="tst-chip-label">AI 思考过程</span>
      </button>

      <!-- Sync -->
      <button
        v-if="syncState === 'syncing'"
        type="button"
        class="tst-chip pill sync-pending"
        aria-label="同步中"
        @click="toggleSync"
      >
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <span>同步中</span>
      </button>
      <button
        v-else-if="syncState === 'changes'"
        type="button"
        class="tst-chip pill sync-changes"
        :aria-label="`${pendingCount} 项变更`"
        @click="toggleSync"
      >
        <i class="pi pi-cloud-upload" aria-hidden="true" />
        <span>{{ pendingCount }} 项变更</span>
      </button>
      <button
        v-else-if="syncState === 'ok'"
        type="button"
        class="tst-chip pill sync-ok"
        aria-label="已同步"
        @click="toggleSync"
      >
        <i class="pi pi-cloud-check" aria-hidden="true" />
        <span>已同步</span>
      </button>
      <button
        v-else
        type="button"
        class="tst-chip"
        aria-label="同步状态"
        @click="toggleSync"
      >
        <i class="pi pi-cloud" aria-hidden="true" />
        <span class="tst-chip-label">同步</span>
      </button>

      <div class="tst-sep" />

      <!-- Notifications -->
      <button
        type="button"
        class="tst-chip"
        aria-label="通知"
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
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
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

.tst-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: rgba(192, 198, 209, 0.85);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  flex-shrink: 0;
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
