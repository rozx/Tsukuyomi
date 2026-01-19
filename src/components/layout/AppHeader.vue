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
import BatchSummaryPanel from 'src/components/novel/BatchSummaryPanel.vue';
import { debounce } from 'lodash';
import { getAssetUrl } from 'src/utils';
import { APP_NAME } from 'src/constants/app';

const ui = useUiStore();
const { unreadCount } = useToastHistory();
const aiProcessing = useAIProcessingStore();
const settingsStore = useSettingsStore();

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
const batchSummaryPanelRef = ref<{ toggle: (event: Event) => void } | null>(null);

const toggleHistoryDialog = (event: Event) => {
  toastHistoryRef.value?.toggle(event);
};

const toggleThinkingPanel = (event: Event) => {
  thinkingPanelRef.value?.toggle(event);
};

const toggleBatchSummaryPanel = (event: Event) => {
  batchSummaryPanelRef.value?.toggle(event);
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
    return { icon: 'pi pi-cloud', color: 'text-moon-400/70', label: '未启用' };
  }
  if (isSyncing.value) {
    return { icon: 'pi pi-spin pi-spinner', color: 'text-primary-400', label: '同步中' };
  }
  if (gistSync.value.lastSyncTime && gistSync.value.lastSyncTime > 0) {
    return { icon: 'pi pi-cloud-upload', color: 'text-accent-300', label: '已同步' };
  }
  return { icon: 'pi pi-cloud', color: 'text-moon-200', label: '未同步' };
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
  <header
    class="sticky top-0 z-20 shrink-0 border-b border-white/5 bg-night-950/50 backdrop-blur-2xl shadow-[0_10px_40px_rgba(5,6,15,0.45)]"
  >
    <Menubar
      :model="menuItems"
      class="!rounded-none !border-0 bg-transparent px-4 py-3 text-moon-80 whitespace-nowrap"
    >
      <template #start>
        <div class="flex items-center gap-3 pr-4 whitespace-nowrap flex-shrink-0">
          <Button
            aria-label="切换侧边栏"
            class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
            icon="pi pi-bars"
            @click="ui.toggleSideMenu()"
          />
          <img :src="logoPath" :alt="APP_NAME.full" class="w-8 h-8 flex-shrink-0" />
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-[0.3em] text-moon-50"
              >{{ APP_NAME.en }} {{ APP_NAME.zh }}</span
            >
            <span class="font-semibold text-moon-100 tracking-wide">{{
              APP_NAME.description.en
            }}</span>
          </div>
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-3 whitespace-nowrap flex-shrink-0">
          <!-- AI 思考过程按钮 -->
          <Button
            ref="thinkingButtonRef"
            aria-label="AI 思考过程"
            class="p-button-text p-button-rounded relative flex max-w-[24rem] items-center gap-2 text-moon-70 transition-all hover:text-moon-100 whitespace-nowrap h-auto min-h-[2.5rem]"
            :class="{ 'thinking-active': aiProcessing.hasActiveTasks }"
            @click="toggleThinkingPanel"
          >
            <i
              class="pi pi-sparkles text-accent-300 flex-shrink-0"
              :class="{ 'animate-spin': aiProcessing.hasActiveTasks }"
            />
            <span class="text-sm text-moon-70">AI 思考过程</span>
            <span v-if="aiTaskStatus" class="text-xs text-moon-50 ml-1">({{ aiTaskStatus }})</span>
          </Button>

          <!-- 同步状态按钮 -->
          <Button
            ref="syncButtonRef"
            aria-label="同步状态"
            class="p-button-text p-button-rounded relative flex items-center gap-2 text-moon-70 transition-colors hover:text-moon-100"
            :class="{ 'sync-active': gistSync.enabled }"
            @click="toggleSyncPanel"
          >
            <i :class="[syncStatus.icon, syncStatus.color]" class="text-lg" />
            <span v-if="gistSync.enabled" class="text-sm uppercase tracking-wide text-moon-60">{{
              formatNextSyncTime
            }}</span>
          </Button>

          <!-- AI 批量摘要按钮 -->
          <Button
            v-if="$route.params.id"
            aria-label="批量摘要"
            class="p-button-text p-button-rounded relative flex items-center gap-2 text-moon-70 transition-colors hover:text-moon-100"
            @click="toggleBatchSummaryPanel"
          >
            <i class="pi pi-list text-lg" />
            <span class="text-sm text-moon-70 hidden sm:inline">批量摘要</span>
          </Button>

          <!-- 消息历史按钮 -->
          <div class="relative inline-flex items-center justify-center">
            <Button
              ref="bellButtonRef"
              aria-label="消息历史"
              class="p-button-text p-button-rounded text-moon-70 transition-colors hover:text-moon-100"
              @click="toggleHistoryDialog"
            >
              <i class="pi pi-bell text-lg" />
            </Button>
            <Badge
              v-if="unreadCount > 0"
              :value="unreadCount > 99 ? '99+' : unreadCount"
              severity="danger"
            />
          </div>

          <!-- 右侧面板切换按钮 -->
          <Button
            aria-label="切换右侧面板"
            class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
            :icon="ui.rightPanelOpen ? 'pi pi-times' : 'pi pi-comments'"
            @click="ui.toggleRightPanel()"
          />
        </div>
      </template>
    </Menubar>

    <!-- Toast 历史 Popover -->
    <ToastHistoryDialog ref="toastHistoryRef" />

    <!-- 同步状态 Popover -->
    <SyncStatusPanel ref="syncPanelRef" />

    <!-- AI 思考过程 Popover -->
    <ThinkingProcessPanel ref="thinkingPanelRef" />

    <!-- 批量摘要生成 Popover -->
    <BatchSummaryPanel ref="batchSummaryPanelRef" />
  </header>
</template>

<style scoped>
/* 确保 Menubar 始终显示为单行 */
:deep(.p-menubar) {
  white-space: nowrap;
  overflow: hidden;
}

:deep(.p-menubar .p-menubar-root-list) {
  white-space: nowrap;
  flex-wrap: nowrap;
}

:deep(.p-menubar .p-menubar-start),
:deep(.p-menubar .p-menubar-end) {
  white-space: nowrap;
  flex-shrink: 0;
}

:deep(.p-menubar .p-menubar-start > *),
:deep(.p-menubar .p-menubar-end > *) {
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
