<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { ref, computed, watch, onMounted, onUnmounted, type ComponentPublicInstance } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import { useUiStore } from 'src/stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useSettingsStore } from 'src/stores/settings';
import ToastHistoryDialog from 'src/components/dialogs/ToastHistoryDialog.vue';
import SyncStatusPanel from 'src/components/sync/SyncStatusPanel.vue';
import ThinkingProcessPanel from 'src/components/ai/ThinkingProcessPanel.vue';

const ui = useUiStore();
const { unreadCount } = useToastHistory();
const aiProcessing = useAIProcessingStore();
const settingsStore = useSettingsStore();

// 获取最新的思考消息（只显示最后一行）
const latestThinkingMessage = computed(() => {
  // 直接访问 store 的 state 以确保响应式
  const activeTasks = aiProcessing.activeTasks;
  const thinkingTasks = activeTasks.filter(
    (task) => task.status === 'thinking' || task.status === 'processing',
  );

  if (thinkingTasks.length === 0) {
    return 'AI 思考过程';
  }

  const latest = thinkingTasks.sort((a, b) => b.startTime - a.startTime)[0];
  if (!latest) {
    return 'AI 思考过程';
  }

  // 优先使用实际的思考消息
  if (latest.thinkingMessage && latest.thinkingMessage.trim()) {
    // 获取最后一行
    const lines = latest.thinkingMessage.split('\n').filter((line) => line.trim());
    const lastLine =
      lines.length > 0 ? lines[lines.length - 1] || latest.thinkingMessage : latest.thinkingMessage;

    // 限制显示长度，避免按钮过长
    if (lastLine && lastLine.length > 50) {
      return lastLine.substring(0, 47) + '...';
    }

    return lastLine || latest.message || 'AI 思考过程';
  }

  return latest.message || `${latest.modelName} 正在思考...`;
});

const menuItems = ref<MenuItem[]>([
  // {
  //   label: '首页',
  //   icon: 'pi pi-home',
  //   command: () => {
  //     void router.push('/');
  //   },
  // },
]);

const bellButtonRef = ref<HTMLElement | null>(null);
const thinkingButtonRef = ref<HTMLElement | null>(null);
const syncButtonRef = ref<HTMLElement | null>(null);
const toastHistoryRef = ref<ComponentPublicInstance<{ toggle: (event: Event) => void }> | null>(
  null,
);
const thinkingPanelRef = ref<{ toggle: (event: Event) => void } | null>(null);
const syncPanelRef = ref<{ toggle: (event: Event) => void } | null>(null);

const toggleHistoryDialog = (event: Event) => {
  toastHistoryRef.value?.toggle(event);
};

const toggleThinkingPanel = (event: Event) => {
  thinkingPanelRef.value?.toggle(event);
};

const toggleSyncPanel = (event: Event) => {
  syncPanelRef.value?.toggle(event);
};

// 同步相关（仅用于按钮状态显示）
const gistSync = computed(() => settingsStore.gistSync);
const isSyncing = computed(() => settingsStore.isSyncing);

// 计算同步状态（仅用于按钮图标）
const syncStatus = computed(() => {
  if (!gistSync.value.enabled) {
    return { icon: 'pi pi-cloud', color: 'text-moon/50', label: '未启用' };
  }
  if (isSyncing.value) {
    return { icon: 'pi pi-spin pi-spinner', color: 'text-primary', label: '同步中' };
  }
  if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) {
    return { icon: 'pi pi-cloud-upload', color: 'text-green-500', label: '已同步' };
  }
  return { icon: 'pi pi-cloud', color: 'text-moon/70', label: '未同步' };
});

// 计算下次同步时间（仅用于按钮标签）
const nextSyncTime = computed(() => {
  if (!gistSync.value.enabled || !gistSync.value.lastSyncTime || gistSync.value.syncInterval <= 0) {
    return null;
  }
  return gistSync.value.lastSyncTime + gistSync.value.syncInterval;
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

// 监听同步配置和下次同步时间的变化
watch(
  [() => gistSync.value.enabled, () => gistSync.value.lastSyncTime, () => gistSync.value.syncInterval, nextSyncTime],
  () => {
    watchSyncConfig();
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
  <header class="sticky top-0 z-20 shadow-sm shrink-0">
    <Menubar :model="menuItems" class="!rounded-none">
      <template #start>
        <div class="flex items-center gap-2 px-2 mr-3">
          <Button
            aria-label="切换侧边栏"
            class="p-button-text p-button-rounded"
            icon="pi pi-bars"
            @click="ui.toggleSideMenu()"
          />
          <i class="pi pi-moon text-primary-600" />
          <span class="font-semibold">Luna AI Translator</span>
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-2 px-2 mr-3">
          <!-- AI 思考过程按钮 -->
          <Button
            ref="thinkingButtonRef"
            aria-label="AI 思考过程"
            class="p-button-text p-button-rounded relative thinking-button"
            :class="{ 'thinking-active': aiProcessing.hasActiveTasks }"
            @click="toggleThinkingPanel"
          >
            <i class="pi pi-sparkles" :class="{ 'animate-spin': aiProcessing.hasActiveTasks }" />
            <span v-if="latestThinkingMessage" class="thinking-button-label">{{
              latestThinkingMessage
            }}</span>
          </Button>

          <!-- 同步状态按钮 -->
          <Button
            ref="syncButtonRef"
            aria-label="同步状态"
            class="p-button-text p-button-rounded relative sync-button"
            :class="{ 'sync-active': gistSync.enabled }"
            @click="toggleSyncPanel"
          >
            <i :class="[syncStatus.icon, syncStatus.color]" />
            <span v-if="gistSync.enabled" class="sync-button-label">{{
              formatNextSyncTime
            }}</span>
          </Button>

          <!-- 消息历史按钮 -->
          <Button
            ref="bellButtonRef"
            aria-label="消息历史"
            class="p-button-text p-button-rounded relative bell-button"
            @click="toggleHistoryDialog"
          >
            <i class="pi pi-bell" />
            <Badge
              v-if="unreadCount > 0"
              :value="unreadCount > 99 ? '99+' : unreadCount"
              class="absolute top-0 right-0"
              severity="danger"
            />
          </Button>
        </div>
      </template>
    </Menubar>

    <!-- Toast 历史 Popover -->
    <ToastHistoryDialog ref="toastHistoryRef" />

    <!-- 同步状态 Popover -->
    <SyncStatusPanel ref="syncPanelRef" />

    <!-- AI 思考过程 Popover -->
    <ThinkingProcessPanel ref="thinkingPanelRef" />
  </header>
</template>

<style scoped>
.sync-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.sync-button:hover i {
  color: var(--moon-opacity-95) !important;
}

.sync-button.sync-active i {
  color: var(--primary-color) !important;
}

.sync-button-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
  display: inline-block;
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  margin-left: 0.5rem;
}

.sync-button.sync-active .sync-button-label {
  color: var(--primary-color);
}

.bell-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
}

.bell-button:hover i {
  color: var(--moon-opacity-95) !important;
}

.thinking-button {
  max-width: 500px;
  overflow: visible;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.thinking-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.thinking-button:hover i {
  color: var(--moon-opacity-95) !important;
}

.thinking-button.thinking-active i {
  color: var(--primary-color) !important;
}

.thinking-button .animate-spin {
  animation: spin 1s linear infinite;
}

.thinking-button-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
  display: inline-block;
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  margin-left: 0.5rem;
}

.thinking-button.thinking-active .thinking-button-label {
  color: var(--primary-color);
}

.thinking-overlay :deep(.p-overlaypanel-content) {
  padding: 1rem;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
