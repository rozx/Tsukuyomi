<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import { useUiStore } from 'src/stores/ui';
import { useSystemBar } from 'src/composables/layout/useSystemBar';
import ToastHistoryDialog from 'src/components/dialogs/ToastHistoryDialog.vue';
import SyncStatusPanel from 'src/components/sync/SyncStatusPanel.vue';
import ThinkingProcessPanel from 'src/components/ai/ThinkingProcessPanel.vue';
import { getAssetUrl } from 'src/utils';
import { APP_NAME } from 'src/constants/app';

const ui = useUiStore();
const isPhone = computed(() => ui.deviceType === 'phone');

const {
  unreadCount,
  pendingCount,
  syncState,
  nextSyncTime,
  latestThinkingStatus,
  thinking,
  toastHistoryRef,
  thinkingPanelRef,
  syncPanelRef,
  toggleHistory,
  toggleThinking,
  toggleSync,
} = useSystemBar();

const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

const aiTaskLabel = computed(() =>
  latestThinkingStatus.value === 'processing' ? '处理中' : '思考中',
);

const handleToggleSideMenu = () => {
  if (isPhone.value && ui.rightPanelOpen) {
    ui.closeRightPanel();
  }
  ui.toggleSideMenu();
};

// 桌面端独有：下次同步的紧凑次级信息（仅在已同步态下展示）
const nowTick = ref(Date.now());
let tickInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tickInterval = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
});

const syncSecondaryLabel = computed<string | null>(() => {
  if (syncState.value !== 'ok') return null;
  const next = nextSyncTime.value;
  if (!next) return null;
  const diff = next - nowTick.value;
  if (diff <= 0) return '即将';
  const totalSeconds = Math.floor(diff / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  return `${Math.floor(totalMinutes / 60)}h`;
});
</script>

<template>
  <header class="dsk-sysbar">
    <div class="dsk-brand">
      <Button
        aria-label="切换侧边栏"
        class="p-button-text p-button-rounded dsk-brand-toggle"
        :class="{ active: ui.sideMenuOpen }"
        icon="pi pi-bars"
        @click="handleToggleSideMenu"
      />
      <img :src="logoPath" :alt="APP_NAME.full" class="dsk-brand-logo" />
      <div v-if="!isPhone" class="dsk-brand-text">
        <span class="dsk-brand-name">{{ APP_NAME.en }} {{ APP_NAME.zh }}</span>
        <span class="dsk-brand-desc">{{ APP_NAME.description.en }}</span>
      </div>
    </div>

    <div class="dsk-actions">
      <!-- AI 思考过程 -->
      <button
        v-if="thinking"
        type="button"
        class="dsk-chip pill thinking"
        aria-label="AI 思考过程"
        @click="toggleThinking"
      >
        <span class="dsk-dot" />
        <span>AI {{ aiTaskLabel }}</span>
      </button>
      <button
        v-else
        type="button"
        class="dsk-chip"
        aria-label="AI 思考过程"
        @click="toggleThinking"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
        <span v-if="!isPhone" class="dsk-chip-label">AI 思考</span>
      </button>

      <!-- 同步状态 -->
      <button
        v-if="syncState === 'syncing'"
        type="button"
        class="dsk-chip pill sync-pending"
        aria-label="同步中"
        @click="toggleSync"
      >
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <span>同步中</span>
      </button>
      <button
        v-else-if="syncState === 'changes'"
        type="button"
        class="dsk-chip pill sync-changes"
        :aria-label="`${pendingCount} 项变更`"
        @click="toggleSync"
      >
        <i class="pi pi-cloud-upload" aria-hidden="true" />
        <span>{{ pendingCount }} 项变更</span>
      </button>
      <button
        v-else-if="syncState === 'ok'"
        type="button"
        class="dsk-chip pill sync-ok"
        aria-label="已同步"
        @click="toggleSync"
      >
        <i class="pi pi-cloud-check" aria-hidden="true" />
        <span>已同步</span>
        <span v-if="syncSecondaryLabel && !isPhone" class="dsk-chip-meta">
          {{ syncSecondaryLabel }}
        </span>
      </button>
      <button
        v-else-if="syncState === 'pending'"
        type="button"
        class="dsk-chip"
        aria-label="未同步"
        @click="toggleSync"
      >
        <i class="pi pi-cloud" aria-hidden="true" />
        <span v-if="!isPhone" class="dsk-chip-label">未同步</span>
      </button>
      <button
        v-else
        type="button"
        class="dsk-chip"
        aria-label="同步状态"
        @click="toggleSync"
      >
        <i class="pi pi-cloud" aria-hidden="true" />
        <span v-if="!isPhone" class="dsk-chip-label">同步</span>
      </button>

      <div class="dsk-sep" />

      <!-- 消息历史 -->
      <button
        type="button"
        class="dsk-chip"
        aria-label="消息历史"
        @click="toggleHistory"
      >
        <i class="pi pi-bell" aria-hidden="true" />
        <span v-if="unreadCount > 0" class="dsk-badge">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </button>

    </div>

    <ToastHistoryDialog ref="toastHistoryRef" />
    <SyncStatusPanel ref="syncPanelRef" />
    <ThinkingProcessPanel ref="thinkingPanelRef" />
    <Button v-show="false" />
  </header>
</template>

<style scoped>
.dsk-sysbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  background: rgba(8, 10, 13, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--white-opacity-4);
  flex-shrink: 0;
  position: relative;
  z-index: 20;
  min-height: 44px;
}

.dsk-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.dsk-brand-toggle {
  color: var(--accent-silver) !important;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dsk-brand-toggle.active {
  background: rgba(109, 136, 168, 0.14) !important;
  color: #bac9db !important;
}

.dsk-brand-logo {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  opacity: 0.9;
  flex-shrink: 0;
}

.dsk-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.1;
  gap: 1px;
}

.dsk-brand-name {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: var(--accent-silver);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsk-brand-desc {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 400;
  color: rgba(174, 183, 198, 0.32);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsk-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dsk-chip {
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
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  flex-shrink: 0;
}

.dsk-chip i {
  font-size: 13px;
  line-height: 1;
}

.dsk-chip-label {
  font-size: 11px;
}

.dsk-chip-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 400;
  opacity: 0.7;
  padding-left: 4px;
  border-left: 1px solid currentColor;
  margin-left: 2px;
}

.dsk-chip:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
}

.dsk-chip.active {
  background: rgba(109, 136, 168, 0.14);
  color: #bac9db;
  border-color: rgba(109, 136, 168, 0.28);
}

/* Pill 变体 */
.dsk-chip.pill {
  padding: 0 10px 0 9px;
  background: rgba(109, 136, 168, 0.1);
  border-color: rgba(109, 136, 168, 0.22);
  color: #bac9db;
}

.dsk-chip.pill.thinking {
  background: rgba(140, 165, 195, 0.12);
  border-color: rgba(140, 165, 195, 0.28);
  color: #c9d8ea;
}

.dsk-chip.pill.thinking i {
  color: #a3b7cf;
}

.dsk-chip.pill.sync-ok {
  background: rgba(167, 209, 176, 0.1);
  border-color: rgba(167, 209, 176, 0.25);
  color: #b9d9c1;
}

.dsk-chip.pill.sync-ok i {
  color: #a7d1b0;
}

.dsk-chip.pill.sync-ok .dsk-chip-meta {
  color: rgba(185, 217, 193, 0.75);
  border-left-color: rgba(167, 209, 176, 0.3);
}

.dsk-chip.pill.sync-pending {
  background: rgba(234, 192, 123, 0.1);
  border-color: rgba(234, 192, 123, 0.25);
  color: #e8c78a;
}

.dsk-chip.pill.sync-pending i {
  color: #e8c78a;
}

.dsk-chip.pill.sync-changes {
  background: rgba(234, 192, 123, 0.12);
  border-color: rgba(234, 192, 123, 0.3);
  color: #e8c78a;
}

.dsk-chip.pill.sync-changes i {
  color: #e8c78a;
}

.dsk-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a3b7cf;
  box-shadow: 0 0 8px #a3b7cf;
  animation: dsk-pulse 1.6s ease-in-out infinite;
}

@keyframes dsk-pulse {
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

.dsk-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #d97757;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1;
  border: 1.5px solid #080a0d;
}

.dsk-sep {
  width: 1px;
  height: 16px;
  background: var(--white-opacity-8);
  margin: 0 4px;
}
</style>
