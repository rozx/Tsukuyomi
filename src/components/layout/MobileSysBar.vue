<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Button from 'primevue/button';
import { useUiStore } from 'src/stores/ui';
import { useSystemBar } from 'src/composables/layout/useSystemBar';
import ToastHistoryDialog from 'src/components/dialogs/ToastHistoryDialog.vue';
import SyncStatusPanel from 'src/components/sync/SyncStatusPanel.vue';
import ThinkingProcessPanel from 'src/components/ai/ThinkingProcessPanel.vue';
import NotificationBadge from 'src/components/layout/NotificationBadge.vue';
import { getAssetUrl } from 'src/utils';
import { APP_NAME } from 'src/constants/app';
import { APP_VERSION } from 'src/constants/version';

const router = useRouter();
const route = useRoute();
const ui = useUiStore();

const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

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

const isHelpActive = computed(() => route.path.startsWith('/help'));

const openHelp = () => {
  if (ui.rightPanelOpen) ui.closeRightPanel();
  if (!route.path.startsWith('/help')) void router.push('/help');
};
</script>

<template>
  <div class="tsm-sysbar">
    <div class="sys-brand">
      <img :src="logoPath" :alt="APP_NAME.full" />
      <div class="sys-brand-text">
        <span class="sys-brand-name">{{ APP_NAME.en }} {{ APP_NAME.zh }}</span>
        <span class="sys-brand-version">v{{ APP_VERSION }}</span>
      </div>
    </div>

    <div class="sys-actions">
      <!-- AI thinking -->
      <button
        v-if="thinking"
        class="tsm-sys-chip pill thinking"
        aria-label="AI 思考过程"
        @click="toggleThinking"
      >
        <span class="tsm-sys-dot" />
        <span>AI 思考中</span>
      </button>
      <button
        v-else
        class="tsm-sys-chip"
        aria-label="AI 思考过程"
        @click="toggleThinking"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
      </button>

      <!-- Sync -->
      <button
        v-if="syncState === 'syncing'"
        class="tsm-sys-chip pill sync-pending"
        aria-label="同步中"
        @click="toggleSync"
      >
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <span>同步中</span>
      </button>
      <button
        v-else-if="syncState === 'changes'"
        class="tsm-sys-chip pill sync-changes"
        :aria-label="`${pendingCount} 项变更`"
        @click="toggleSync"
      >
        <i class="pi pi-cloud-upload" aria-hidden="true" />
        <span>{{ pendingCount }} 项变更</span>
      </button>
      <button
        v-else-if="syncState === 'ok'"
        class="tsm-sys-chip pill sync-ok"
        aria-label="已同步"
        @click="toggleSync"
      >
        <i class="pi pi-cloud-check" aria-hidden="true" />
        <span>已同步</span>
      </button>
      <button
        v-else
        class="tsm-sys-chip"
        aria-label="同步状态"
        @click="toggleSync"
      >
        <i class="pi pi-cloud" aria-hidden="true" />
      </button>

      <div class="tsm-sys-sep" />

      <!-- Notifications -->
      <button
        class="tsm-sys-chip"
        aria-label="通知"
        @click="toggleHistory"
      >
        <i class="pi pi-bell" aria-hidden="true" />
        <NotificationBadge v-if="unreadCount > 0">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </NotificationBadge>
      </button>

      <!-- Help -->
      <button
        class="tsm-sys-chip"
        :class="{ active: isHelpActive }"
        aria-label="帮助"
        @click="openHelp"
      >
        <i class="pi pi-question-circle" aria-hidden="true" />
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
.tsm-sysbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 16px;
  background: rgba(8, 10, 13, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
  position: relative;
  z-index: 6;
  min-height: 32px;
}

.sys-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.sys-brand img {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  opacity: 0.9;
  flex-shrink: 0;
}

.sys-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1;
  gap: 2px;
}

.sys-brand-name {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgba(174, 183, 198, 0.85);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sys-brand-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 7px;
  font-weight: 400;
  color: rgba(174, 183, 198, 0.28);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sys-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Chip (icon-only default; pill variant when state is notable) */
.tsm-sys-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 24px;
  padding: 0 6px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: rgba(192, 198, 209, 0.85);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  flex-shrink: 0;
}

.tsm-sys-chip i {
  font-size: 12px;
  line-height: 1;
}

.tsm-sys-chip:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
}

.tsm-sys-chip.active {
  background: rgba(109, 136, 168, 0.14);
  color: #bac9db;
  border-color: rgba(109, 136, 168, 0.28);
}

/* Pill */
.tsm-sys-chip.pill {
  padding: 0 8px 0 7px;
  background: rgba(109, 136, 168, 0.1);
  border-color: rgba(109, 136, 168, 0.22);
  color: #bac9db;
}

.tsm-sys-chip.pill.thinking {
  background: rgba(140, 165, 195, 0.12);
  border-color: rgba(140, 165, 195, 0.28);
  color: #c9d8ea;
}

.tsm-sys-chip.pill.thinking i {
  color: #a3b7cf;
}

.tsm-sys-chip.pill.sync-ok {
  background: rgba(167, 209, 176, 0.1);
  border-color: rgba(167, 209, 176, 0.25);
  color: #b9d9c1;
}

.tsm-sys-chip.pill.sync-ok i {
  color: #a7d1b0;
}

.tsm-sys-chip.pill.sync-pending {
  background: rgba(234, 192, 123, 0.1);
  border-color: rgba(234, 192, 123, 0.25);
  color: #e8c78a;
}

.tsm-sys-chip.pill.sync-changes {
  background: rgba(234, 192, 123, 0.12);
  border-color: rgba(234, 192, 123, 0.3);
  color: #e8c78a;
}

.tsm-sys-chip.pill.sync-changes i {
  color: #e8c78a;
}

/* Thinking dot (pulsing) */
.tsm-sys-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a3b7cf;
  box-shadow: 0 0 8px #a3b7cf;
  animation: tsm-sys-pulse 1.6s ease-in-out infinite;
}

@keyframes tsm-sys-pulse {
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

.tsm-sys-sep {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 2px;
}
</style>
