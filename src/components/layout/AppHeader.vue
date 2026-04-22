<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Button from 'primevue/button';
import { useUiStore } from 'src/stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useSyncStatusDisplay } from 'src/composables/useSyncPendingChanges';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useSettingsStore } from 'src/stores/settings';
import ToastHistoryDialog from 'src/components/dialogs/ToastHistoryDialog.vue';
import SyncStatusPanel from 'src/components/sync/SyncStatusPanel.vue';
import ThinkingProcessPanel from 'src/components/ai/ThinkingProcessPanel.vue';
import BatchEmbeddingsPanel from 'src/components/novel/BatchEmbeddingsPanel.vue';
import { debounce } from 'lodash';
import { getAssetUrl } from 'src/utils';
import { APP_NAME } from 'src/constants/app';

const ui = useUiStore();
const { unreadCount } = useToastHistory();
const aiProcessing = useAIProcessingStore();
const settingsStore = useSettingsStore();
const isPhone = computed(() => ui.deviceType === 'phone');

const activeTranslationTaskCount = computed(() => aiProcessing.activeTranslationTaskCount);

const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

// 获取 AI 任务状态（只显示状态，不显示思考消息内容）
const aiTaskStatus = computed(() => {
  // 直接访问 store 的 state 以确保响应式
  const activeTasks = aiProcessing.activeTasks;
  const thinkingTasks = activeTasks.filter(
    (task) => task.status === 'thinking' || task.status === 'processing',
  );

  if (thinkingTasks.length === 0) {
    return null; // 没有进行中的任务，不显示状态
  }

  const latest = thinkingTasks.sort((a, b) => b.startTime - a.startTime)[0];
  if (!latest) {
    return null;
  }

  // 根据任务状态返回对应的状态文本
  if (latest.status === 'thinking') {
    return '思考中';
  } else if (latest.status === 'processing') {
    return '处理中';
  }

  return null;
});

const syncButtonRef = ref<HTMLElement | null>(null);
const toastHistoryRef = ref<{ toggle: (event: Event) => void } | null>(null);
const thinkingPanelRef = ref<{ toggle: (event: Event) => void } | null>(null);
const syncPanelRef = ref<{ toggle: (event: Event) => void } | null>(null);
const batchEmbeddingsPanelRef = ref<{ toggle: (event: Event) => void } | null>(null);

const toggleHistoryDialog = (event: Event) => {
  toastHistoryRef.value?.toggle(event);
};

const toggleThinkingPanel = (event: Event) => {
  thinkingPanelRef.value?.toggle(event);
};

const toggleBatchEmbeddingsPanel = (event: Event) => {
  batchEmbeddingsPanelRef.value?.toggle(event);
};

const toggleSyncPanel = (event: Event) => {
  syncPanelRef.value?.toggle(event);
};

const handleToggleSideMenu = () => {
  if (isPhone.value && ui.rightPanelOpen) {
    ui.closeRightPanel();
  }
  ui.toggleSideMenu();
};

const handleToggleRightPanel = () => {
  if (isPhone.value && ui.sideMenuOpen) {
    ui.closeSideMenu();
  }
  ui.toggleRightPanel();
};

// 同步相关（仅用于按钮状态显示）
const { gistSync, isSyncing, pendingCount, hasPendingChanges, syncStatus, nextSyncTime } =
  useSyncStatusDisplay({
    disabled: 'text-moon-400/70',
    syncing: 'text-primary-400',
    pending: 'text-amber-300',
    synced: 'text-accent-300',
    unsynced: 'text-moon-200',
  });

// 倒计时状态（秒数）
const countdownSeconds = ref<number | null>(null);

// 更新倒计时
const updateCountdown = () => {
  const next = nextSyncTime.value;
  if (!next) {
    countdownSeconds.value = null;
    return;
  }
  const now = Date.now();
  const diff = next - now;
  if (diff <= 0) {
    countdownSeconds.value = 0;
    return;
  }
  const seconds = Math.floor(diff / 1000);
  // 如果少于1分钟（60秒），显示倒计时
  if (seconds < 60) {
    countdownSeconds.value = seconds;
  } else {
    countdownSeconds.value = null;
  }
};

// 定时器
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// 启动倒计时定时器
const startCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  updateCountdown();
  countdownInterval = setInterval(() => {
    updateCountdown();
    // 如果倒计时结束，清除定时器
    if (countdownSeconds.value !== null && countdownSeconds.value <= 0) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  }, 1000);
};

// 停止倒计时定时器
const stopCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownSeconds.value = null;
};

// 监听同步配置变化，重新启动倒计时
const watchSyncConfig = () => {
  stopCountdown();
  if (gistSync.value.enabled && nextSyncTime.value) {
    const now = Date.now();
    const diff = nextSyncTime.value - now;
    if (diff > 0 && diff < 60000) {
      // 如果距离下次同步少于1分钟，启动倒计时
      startCountdown();
    }
  }
};

// 格式化下次同步时间（仅用于按钮标签）
const formatNextSyncTime = computed(() => {
  // 如果正在同步，显示同步状态
  if (isSyncing.value) {
    return '同步中...';
  }

  // 如果未启用同步，显示状态
  if (!gistSync.value.enabled) {
    return syncStatus.value.label;
  }

  // 有未同步的本地变更——优先展示数量
  if (hasPendingChanges.value) {
    return `${pendingCount.value} 项变更`;
  }

  const next = nextSyncTime.value;
  if (!next) {
    // 如果没有下次同步时间，检查是否有最后同步时间
    if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) {
      return '已同步';
    }
    return '未同步';
  }

  // 如果正在倒计时，显示倒计时
  if (countdownSeconds.value !== null && countdownSeconds.value >= 0) {
    return `${countdownSeconds.value}秒`;
  }

  const now = Date.now();
  const diff = next - now;
  if (diff <= 0) {
    return '即将同步';
  }
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours} 小时后`;
  }
  if (minutes > 0) {
    return `${minutes} 分钟后`;
  }
  return '即将同步';
});

// 定期检查定时器
let checkInterval: ReturnType<typeof setInterval> | null = null;

const debouncedWatchSyncConfig = debounce(() => {
  watchSyncConfig();
}, 500);

// 监听同步配置和下次同步时间的变化
watch(
  [
    () => gistSync.value.enabled,
    () => gistSync.value.lastSyncTime,
    () => gistSync.value.syncInterval,
    nextSyncTime,
  ],
  () => {
    debouncedWatchSyncConfig();
  },
  { immediate: true },
);

onMounted(() => {
  watchSyncConfig();
  // 定期检查是否需要启动倒计时
  checkInterval = setInterval(() => {
    watchSyncConfig();
  }, 5000); // 每5秒检查一次
});

onUnmounted(() => {
  stopCountdown();
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
});
</script>

<template>
  <!--
    性能：之前这里是 backdrop-blur-2xl（40px 高斯模糊）+ bg-night-950/50 半透明。
    header 虽然 sticky（不随滚动移动），但滚动时其下方内容在变化，浏览器仍会在每帧重做模糊合成。
    blur 半径的开销约为 O(radius²)：40px → 12px 约便宜 11 倍。
    同时把底色从 /50 提升到 /85，即便没有模糊也能有清晰的层次分离。
  -->
  <header class="dsk-sysbar">
    <div class="dsk-brand">
      <Button
        aria-label="切换侧边栏"
        class="p-button-text p-button-rounded dsk-brand-toggle"
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
      <button
        v-if="aiProcessing.hasActiveTasks"
        type="button"
        class="dsk-chip pill thinking"
        aria-label="AI 思考过程"
        @click="toggleThinkingPanel"
      >
        <span class="dsk-dot" />
        <span>AI {{ aiTaskStatus ?? '思考中' }}</span>
      </button>
      <button
        v-else
        type="button"
        class="dsk-chip"
        aria-label="AI 思考过程"
        @click="toggleThinkingPanel"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
        <span class="dsk-chip-label">AI 思考过程</span>
      </button>

      <button
        ref="syncButtonRef"
        type="button"
        class="dsk-chip"
        :class="{ pill: gistSync.enabled && (isSyncing || hasPendingChanges) }"
        aria-label="同步状态"
        @click="toggleSyncPanel"
      >
        <i :class="[syncStatus.icon, syncStatus.color]" aria-hidden="true" />
        <span v-if="gistSync.enabled && !isPhone" class="dsk-chip-label">
          {{ formatNextSyncTime }}
        </span>
      </button>

      <button
        v-if="$route.params.id"
        type="button"
        class="dsk-chip"
        aria-label="向量索引"
        @click="toggleBatchEmbeddingsPanel"
      >
        <i class="pi pi-bolt" aria-hidden="true" />
      </button>

      <div class="dsk-sep" />

      <button
        ref="bellButtonRef"
        type="button"
        class="dsk-chip"
        aria-label="消息历史"
        @click="toggleHistoryDialog"
      >
        <i class="pi pi-bell" aria-hidden="true" />
        <span v-if="unreadCount > 0" class="dsk-badge">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </button>

      <button
        type="button"
        class="dsk-chip"
        :class="{ active: ui.rightPanelOpen }"
        aria-label="切换右侧面板"
        @click="handleToggleRightPanel"
      >
        <i
          class="pi"
          :class="ui.rightPanelOpen ? 'pi-times' : 'pi-objects-column'"
          aria-hidden="true"
        />
        <span v-if="activeTranslationTaskCount > 0" class="dsk-badge">
          {{ activeTranslationTaskCount > 99 ? '99+' : activeTranslationTaskCount }}
        </span>
      </button>
    </div>

    <ToastHistoryDialog ref="toastHistoryRef" />
    <SyncStatusPanel ref="syncPanelRef" />
    <ThinkingProcessPanel ref="thinkingPanelRef" />
    <BatchEmbeddingsPanel ref="batchEmbeddingsPanelRef" />
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
  min-height: 40px;
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
  color: var(--accent-silver);
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

.dsk-chip:hover {
  background: var(--white-opacity-4);
  color: var(--moon-opacity-100);
}

.dsk-chip.active {
  background: rgba(109, 136, 168, 0.14);
  color: #bac9db;
  border-color: rgba(109, 136, 168, 0.28);
}

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
