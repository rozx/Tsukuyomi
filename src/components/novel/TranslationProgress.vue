<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useUiStore } from 'src/stores/ui';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import { TodoListService, type TodoItem } from 'src/services/todo-list-service';
import { getChapterDisplayTitle } from 'src/utils/novel-utils';
import { formatTaskDuration } from 'src/utils';
import TaskSwitcher from './translation-progress/TaskSwitcher.vue';
import TaskStatusBar from './translation-progress/TaskStatusBar.vue';
import TaskTodos from './translation-progress/TaskTodos.vue';
import TaskStream from './translation-progress/TaskStream.vue';
import TaskActionBar from './translation-progress/TaskActionBar.vue';

const aiProcessingStore = useAIProcessingStore();
const bookDetailsStore = useBookDetailsStore();
const booksStore = useBooksStore();
const contextStore = useContextStore();
const uiStore = useUiStore();
const toast = useToastWithHistory();

const isPhone = computed(() => uiStore.deviceType === 'phone');

// 手机端分段 tab（实时/统计/日志）
const mobileTab = ref<'live' | 'stats' | 'log'>('live');

// 实时时钟
const now = ref(Date.now());
let nowTimer: number | null = null;

// 待办事项
const todos = ref<TodoItem[]>([]);

// ─── 任务列表（从 store 派生）───

const showOnlyCurrentChapter = computed(
  () => bookDetailsStore.translationProgress.showOnlyCurrentChapter,
);

const currentSelectedChapterId = computed(() => {
  const currentBookId = contextStore.currentBookId;
  if (!currentBookId) return null;
  return bookDetailsStore.selectedChapter[currentBookId] || null;
});

const recentAITasks = computed(() => {
  let tasks = aiProcessingStore.activeTasks.filter(
    (t) =>
      (t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading') &&
      !t.isSingleParagraph,
  );
  if (showOnlyCurrentChapter.value && currentSelectedChapterId.value) {
    tasks = tasks.filter((t) => t.chapterId === currentSelectedChapterId.value);
  }
  return [...tasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

// ─── 当前选中任务 ───

const selectedTaskId = computed(() => bookDetailsStore.translationProgress.selectedTaskId);

const currentTask = computed(
  () => recentAITasks.value.find((t) => t.id === selectedTaskId.value) ?? null,
);

// ─── 思考消息格式化 ───

const { getFormatted } = useThinkingFormatter(recentAITasks);

const currentParts = computed(() =>
  currentTask.value ? getFormatted(currentTask.value.id) : [],
);

// ─── 待办事项 ───

const loadTodos = () => {
  const allTodos = TodoListService.getAllTodos();
  const taskIds = new Set(recentAITasks.value.map((t) => t.id));
  todos.value = allTodos.filter((t) => taskIds.has(t.taskId));
};

const currentTaskTodos = computed(() =>
  currentTask.value ? todos.value.filter((t) => t.taskId === currentTask.value!.id) : [],
);

const handleStorageChange = (e: StorageEvent) => {
  if (e.key === 'tsukuyomi-todo-list') loadTodos();
};

watch(() => recentAITasks.value.map((t) => t.id), loadTodos);

// ─── 自动滚动 ───

const autoScrollEnabled = computed(() => {
  const store = bookDetailsStore.translationProgress.autoScrollEnabled;
  return (taskId: string) => store[taskId] !== false;
});

const currentAutoScroll = computed(() =>
  currentTask.value ? autoScrollEnabled.value(currentTask.value.id) : true,
);

const toggleAutoScroll = () => {
  if (!currentTask.value) return;
  const taskId = currentTask.value.id;
  bookDetailsStore.setTranslationProgressAutoScroll(taskId, !autoScrollEnabled.value(taskId));
};

// ─── 章节标题辅助 ───

const getWorkingChapterLabel = (task: AIProcessingTask): string | null => {
  const title = task.chapterTitle?.trim();
  if (title) return title;
  if (task.bookId && task.chapterId) {
    const book = booksStore.getBookById(task.bookId);
    if (book?.volumes) {
      for (const volume of book.volumes) {
        const chapter = volume.chapters?.find((c) => c.id === task.chapterId);
        if (chapter) {
          const displayTitle = getChapterDisplayTitle(chapter, book).trim();
          if (displayTitle) return displayTitle;
        }
      }
    }
  }
  return task.chapterId || null;
};

// ─── 时间格式化 ───
// 使用共享 formatTaskDuration 并传入响应式 now.value，让计时器随 1Hz 定时器持续刷新
const formatDuration = (startTime: number, endTime?: number): string =>
  formatTaskDuration(startTime, endTime, now.value);

// ─── 任务选择 ───

const selectTask = (taskId: string) => {
  bookDetailsStore.selectTask(taskId);
};

// ─── 4.3 新任务自动选中 ───

watch(
  () => recentAITasks.value.map((t) => t.id),
  (newIds, oldIds) => {
    const oldSet = new Set(oldIds || []);
    const newTask = newIds.find((id) => !oldSet.has(id));
    if (newTask) {
      bookDetailsStore.selectTask(newTask);
    } else if (!selectedTaskId.value && newIds.length > 0) {
      bookDetailsStore.selectTask(newIds[0]!);
    } else if (selectedTaskId.value && !newIds.includes(selectedTaskId.value) && newIds.length > 0) {
      bookDetailsStore.selectTask(newIds[0]!);
    }
  },
  { flush: 'post', immediate: true },
);

// ─── 4.2 未读活动检测 ───

watch(
  () =>
    recentAITasks.value.map((t) => ({
      id: t.id,
      thinkingLen: t.thinkingMessage?.length || 0,
      outputLen: t.outputContent?.length || 0,
    })),
  (newTasks, oldTasks) => {
    const oldMap = new Map((oldTasks || []).map((t) => [t.id, t]));
    for (const task of newTasks) {
      if (task.id === selectedTaskId.value) continue;
      const old = oldMap.get(task.id);
      if (!old) continue;
      if (task.thinkingLen > old.thinkingLen || task.outputLen > old.outputLen) {
        bookDetailsStore.setUnseenActivity(task.id);
      }
    }
  },
  { flush: 'post' },
);

// ─── 操作 ───

const stopTask = () => {
  if (currentTask.value) {
    void aiProcessingStore.stopTask(currentTask.value.id);
  }
};

const clearCompletedTasks = async () => {
  const translationTasks = aiProcessingStore.activeTasks.filter(
    (t) =>
      (t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading') &&
      !t.isSingleParagraph &&
      (t.status === 'end' || t.status === 'error' || t.status === 'cancelled'),
  );
  await Promise.all(translationTasks.map((t) => aiProcessingStore.removeTask(t.id)));
  translationTasks.forEach((t) => bookDetailsStore.clearTaskTranslationProgress(t.id));
  toast.add({
    severity: 'success',
    summary: '清除成功',
    detail: `已清除 ${translationTasks.length} 个已结束任务`,
    life: 3000,
  });
};

const toggleChapterFilter = () => {
  bookDetailsStore.toggleTranslationProgressShowOnlyCurrentChapter();
};

const toggleTodoCollapsed = () => {
  bookDetailsStore.toggleTodoCollapsed();
};

// ─── 生命周期 ───

onMounted(() => {
  if (!bookDetailsStore.isLoaded) bookDetailsStore.loadState();
  // 清理 localStorage 中废弃的 taskId 状态
  const activeIds = new Set(aiProcessingStore.activeTasks.map((t) => t.id));
  bookDetailsStore.cleanupStaleTaskState(activeIds);
  loadTodos();
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('tsukuyomi-todos-updated', loadTodos);
  nowTimer = window.setInterval(() => { now.value = Date.now(); }, 1000);
});

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('tsukuyomi-todos-updated', loadTodos);
  if (nowTimer !== null) { clearInterval(nowTimer); nowTimer = null; }
});

// ─── 手机端：基于当前任务的派生数据 ───

// 进度：current/total
const mobileProgress = computed(() => {
  const p = currentTask.value?.progress;
  if (!p || !p.total) return { current: 0, total: 0, percent: 0 };
  const percent = Math.min(100, Math.round((p.current / p.total) * 100));
  return { current: p.current, total: p.total, percent };
});

// 预计剩余（线性外推）
const mobileEta = computed<string>(() => {
  const task = currentTask.value;
  if (!task) return '—';
  if (task.status === 'end' || task.status === 'error' || task.status === 'cancelled') return '已结束';
  const { current, total } = mobileProgress.value;
  if (!total || current <= 0) return '—';
  if (current >= total) return '即将完成';
  const elapsed = Math.max(0, now.value - task.startTime);
  const rate = elapsed / current; // ms per unit
  const remaining = (total - current) * rate;
  const seconds = Math.max(0, Math.floor(remaining / 1000));
  if (seconds < 60) return `~ ${seconds} 秒`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `~ ${mins} 分 ${String(secs).padStart(2, '0')} 秒`;
});

// 手机端任务状态描述（ChineseWorkflow）
const mobileWorkflowLabel = computed<string>(() => {
  const task = currentTask.value;
  if (!task) return '';
  if (task.status === 'end') return '已完成';
  if (task.status === 'error') return '已失败';
  if (task.status === 'cancelled') return '已取消';
  switch (task.workflowStatus) {
    case 'planning':
      return '规划阶段';
    case 'working':
      return '翻译中';
    case 'review':
      return '审核阶段';
    case 'end':
      return '已完成';
    default:
      return task.status === 'thinking' ? '思考中' : '处理中';
  }
});

// 当前章节标题（用于副标题）
const mobileCurrentChapterLabel = computed<string>(() => {
  const task = currentTask.value;
  if (!task) return '';
  const label = getWorkingChapterLabel(task);
  return label || '';
});

// 统计卡片数据
const mobileStatTotals = computed(() => {
  const task = currentTask.value;
  const total = task?.progress?.total ?? 0;
  const current = task?.progress?.current ?? 0;
  const elapsedMs = task ? Math.max(0, (task.endTime ?? now.value) - task.startTime) : 0;
  const seconds = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const elapsedLabel = seconds > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : '—';
  const avgMs = current > 0 ? Math.round(elapsedMs / current) : 0;
  const avgLabel = avgMs > 0 ? (avgMs >= 1000 ? `${(avgMs / 1000).toFixed(1)}s/段` : `${avgMs}ms/段`) : '—';
  return [
    { label: '总段数', value: String(total), icon: 'pi-list' },
    { label: '已完成', value: String(current), icon: 'pi-check-circle' },
    { label: '总耗时', value: elapsedLabel, icon: 'pi-clock' },
    { label: '平均速度', value: avgLabel, icon: 'pi-bolt' },
  ];
});

// 手机端操作
const mobileIsRunning = computed(() => {
  const s = currentTask.value?.status;
  return s === 'thinking' || s === 'processing';
});

const mobilePause = () => {
  // 翻译任务无暂停原语，这里 pause == stop
  stopTask();
};

const mobileCancel = () => {
  stopTask();
};

const closeMobilePanel = () => {
  uiStore.closeRightPanel();
};

const mobileOpenBatchSettings = () => {
  // 简化：引导用户回到书籍详情页的批量设置入口（暂用 toast 提示）
  toast.add({
    severity: 'info',
    summary: '批量设置',
    detail: '请在书籍设置中调整批量翻译参数。',
    life: 2000,
  });
};

// 手机端状态图例（颜色 · 数量）
const mobileLegend = computed(() => {
  const task = currentTask.value;
  if (!task) {
    return [
      { color: '#A7D1B0', label: '成功', value: 0 },
      { color: '#A3B7CF', label: '进行中', value: 0 },
      { color: '#F2C037', label: '排队', value: 0 },
      { color: '#EF5F5F', label: '失败', value: 0 },
    ];
  }
  const { current, total } = mobileProgress.value;
  const queued = Math.max(0, total - current - (mobileIsRunning.value ? 1 : 0));
  const running = mobileIsRunning.value ? 1 : 0;
  const failed = task.status === 'error' ? 1 : 0;
  return [
    { color: '#A7D1B0', label: '成功', value: current },
    { color: '#A3B7CF', label: '进行中', value: running },
    { color: '#F2C037', label: '排队', value: queued },
    { color: '#EF5F5F', label: '失败', value: failed },
  ];
});
</script>

<template>
  <!-- 手机端 · 翻译进度（匹配设计稿） -->
  <div v-if="isPhone" class="translation-progress mtp">
    <!-- Header -->
    <header class="mtp-head">
      <div class="mtp-head-icon"><i class="pi pi-bolt" aria-hidden="true" /></div>
      <div class="mtp-head-text">
        <div class="mtp-head-title">翻译进度</div>
        <div class="mtp-head-sub">
          <template v-if="currentTask && mobileCurrentChapterLabel">
            {{ mobileCurrentChapterLabel }} · {{ mobileWorkflowLabel }}
          </template>
          <template v-else-if="currentTask">{{ mobileWorkflowLabel }}</template>
          <template v-else>暂无翻译任务</template>
        </div>
      </div>
      <button class="mtp-head-close" aria-label="关闭" @click="closeMobilePanel">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <template v-if="currentTask">
      <!-- Hero meter -->
      <div class="mtp-hero">
        <div class="mtp-hero-row">
          <div>
            <div class="mtp-hero-num">
              {{ mobileProgress.current }}<span class="mtp-hero-den"> / {{ mobileProgress.total }}</span>
            </div>
            <div class="mtp-hero-label">段落已完成</div>
          </div>
          <div class="mtp-hero-right">
            <div class="mtp-hero-eta">{{ mobileEta }}</div>
            <div class="mtp-hero-label">预计剩余</div>
          </div>
        </div>
        <div class="mtp-bar">
          <div class="mtp-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
          <div v-if="mobileIsRunning" class="mtp-bar-shimmer" :style="{ left: `${mobileProgress.percent}%` }" />
        </div>
        <div class="mtp-legend">
          <span v-for="item in mobileLegend" :key="item.label">
            <span class="mtp-legend-dot" :style="{ color: item.color }">●</span>
            {{ item.label }} {{ item.value }}
          </span>
        </div>
      </div>

      <!-- Segmented tabs -->
      <div class="mtp-seg-wrap">
        <div class="mtp-seg">
          <button
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'live' }"
            @click="mobileTab = 'live'"
          >实时</button>
          <button
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'stats' }"
            @click="mobileTab = 'stats'"
          >统计</button>
          <button
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'log' }"
            @click="mobileTab = 'log'"
          >日志</button>
        </div>
      </div>

      <!-- Body -->
      <div class="mtp-body">
        <!-- 实时 -->
        <template v-if="mobileTab === 'live'">
          <div class="mtp-live-card">
            <div class="mtp-live-head">
              <i
                class="pi mtp-live-spinner"
                :class="mobileIsRunning ? 'pi-spin pi-spinner' : 'pi-check-circle'"
                aria-hidden="true"
              />
              <span class="mtp-live-eyebrow">
                {{ mobileIsRunning ? '正在翻译' : '已停止' }} ·
                § {{ String(mobileProgress.current).padStart(3, '0') }}
              </span>
              <span class="mtp-live-model">
                <i class="pi pi-sparkles" aria-hidden="true" />
                {{ currentTask.modelName }}
              </span>
            </div>
            <div v-if="currentTask.progress?.message" class="mtp-live-text">
              {{ currentTask.progress.message }}
            </div>
            <div v-else-if="currentTask.thinkingMessage" class="mtp-live-text">
              {{ currentTask.thinkingMessage.split('\n').slice(-1)[0] }}
            </div>
            <div class="mtp-live-bar">
              <div class="mtp-live-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
            </div>
            <div class="mtp-live-meta">
              <span>
                上下文
                <template v-if="currentTask.contextPercentage !== undefined">
                  {{ currentTask.contextPercentage }}%
                </template>
                <template v-else>—</template>
              </span>
              <span>{{ formatDuration(currentTask.startTime, currentTask.endTime) }}</span>
            </div>
          </div>

          <div class="mtp-section-label">活动记录</div>
          <div class="mtp-stream-wrap mtp-stream-wrap--compact">
            <TaskStream
              :task="currentTask"
              :parts="currentParts"
              :auto-scroll="currentAutoScroll"
              @toggle-auto-scroll="toggleAutoScroll"
            />
          </div>
        </template>

        <!-- 统计 -->
        <template v-else-if="mobileTab === 'stats'">
          <div class="mtp-section-label">模型使用</div>
          <div class="mtp-model-card">
            <div class="mtp-model-head">
              <span class="mtp-model-dot" />
              <span class="mtp-model-name">{{ currentTask.modelName }}</span>
              <span class="mtp-model-count">{{ mobileProgress.current }} 次调用</span>
            </div>
            <div class="mtp-model-bar">
              <div class="mtp-model-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
            </div>
            <div class="mtp-model-meta">
              <span>进度 {{ mobileProgress.percent }}%</span>
              <span>{{ mobileWorkflowLabel }}</span>
            </div>
          </div>

          <div class="mtp-section-label">本次批量</div>
          <div class="mtp-totals">
            <div v-for="t in mobileStatTotals" :key="t.label" class="mtp-total">
              <div class="mtp-total-head">
                <span class="mtp-total-label">{{ t.label }}</span>
                <i :class="['pi', t.icon, 'mtp-total-icon']" aria-hidden="true" />
              </div>
              <div class="mtp-total-value">{{ t.value }}</div>
            </div>
          </div>
        </template>

        <!-- 日志 -->
        <template v-else-if="mobileTab === 'log'">
          <div class="mtp-todos-wrap">
            <TaskTodos
              :todos="currentTaskTodos"
              :collapsed="bookDetailsStore.translationProgress.todoCollapsed"
              @toggle-collapsed="toggleTodoCollapsed"
            />
          </div>
          <div class="mtp-stream-wrap">
            <TaskStream
              :task="currentTask"
              :parts="currentParts"
              :auto-scroll="currentAutoScroll"
              @toggle-auto-scroll="toggleAutoScroll"
            />
          </div>
        </template>
      </div>

      <!-- Bottom actions -->
      <div class="mtp-actions">
        <button
          class="mtp-btn mtp-btn-outline"
          :disabled="!mobileIsRunning"
          @click="mobilePause"
        >
          <i class="pi pi-pause" aria-hidden="true" />暂停
        </button>
        <button
          class="mtp-btn mtp-btn-outline mtp-btn-danger"
          :disabled="!mobileIsRunning"
          @click="mobileCancel"
        >
          <i class="pi pi-times" aria-hidden="true" />取消
        </button>
        <div class="mtp-actions-spacer" />
        <button class="mtp-btn mtp-btn-blue" @click="mobileOpenBatchSettings">
          <i class="pi pi-cog" aria-hidden="true" />批量设置
        </button>
      </div>
    </template>

    <div v-else class="empty-state">
      <i class="pi pi-info-circle" />
      <span>暂无翻译任务</span>
    </div>
  </div>

  <!-- 桌面 / 平板 · 原有布局 -->
  <div v-else class="translation-progress">
    <TaskSwitcher
      :tasks="recentAITasks"
      :selected-task-id="selectedTaskId"
      :unseen-activity="bookDetailsStore.translationProgress.unseenActivity"
      :get-working-chapter-label="getWorkingChapterLabel"
      :format-duration="formatDuration"
      @select="selectTask"
    />

    <template v-if="currentTask">
      <TaskStatusBar
        :task="currentTask"
        :format-duration="formatDuration"
      />

      <TaskTodos
        :todos="currentTaskTodos"
        :collapsed="bookDetailsStore.translationProgress.todoCollapsed"
        @toggle-collapsed="toggleTodoCollapsed"
      />

      <TaskStream
        :task="currentTask"
        :parts="currentParts"
        :auto-scroll="currentAutoScroll"
        @toggle-auto-scroll="toggleAutoScroll"
      />

      <TaskActionBar
        :task="currentTask"
        :show-only-current-chapter="showOnlyCurrentChapter"
        @stop="stopTask"
        @clear="clearCompletedTasks"
        @toggle-chapter-filter="toggleChapterFilter"
      />
    </template>

    <div v-else class="empty-state">
      <i class="pi pi-info-circle" />
      <span>暂无翻译任务</span>
    </div>
  </div>
</template>

<style scoped>
.translation-progress {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* 强制所有子组件中的文本正确换行，防止溢出面板 */
.translation-progress :deep(p),
.translation-progress :deep(.todo-text),
.translation-progress :deep(.stream-text),
.translation-progress :deep(.tool-result),
.translation-progress :deep(.thinking-content) {
  overflow-wrap: break-word;
  word-break: break-word;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  color: var(--moon-opacity-40);
  font-size: 0.875rem;
  flex: 1;
}

/* ───────────────── Mobile translation progress (matches design) ───────────────── */
.mtp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.mtp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.mtp-head-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(109, 136, 168, 0.18);
  border: 1px solid rgba(109, 136, 168, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mtp-head-icon i {
  color: #a3b7cf;
  font-size: 14px;
}

.mtp-head-text {
  flex: 1;
  min-width: 0;
}

.mtp-head-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.mtp-head-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtp-head-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(247, 244, 236, 0.75);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-head-close:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(247, 244, 236, 1);
}

.mtp-head-close i {
  font-size: 12px;
}

/* Hero meter */
.mtp-hero {
  padding: 16px 20px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mtp-hero-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.mtp-hero-num {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 30px;
  font-weight: 700;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
  line-height: 1;
}

.mtp-hero-den {
  color: rgba(247, 244, 236, 0.55);
  font-weight: 400;
}

.mtp-hero-label {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.mtp-hero-right {
  text-align: right;
}

.mtp-hero-eta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #a3b7cf;
  font-weight: 500;
}

.mtp-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.mtp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6d88a8, #d8dde8);
  border-radius: 3px;
  box-shadow: 0 0 12px rgba(109, 136, 168, 0.5);
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-bar-shimmer {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  transition: left 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  flex-wrap: wrap;
}

.mtp-legend-dot {
  margin-right: 2px;
}

/* Segmented tabs */
.mtp-seg-wrap {
  padding: 12px 16px 0;
  flex-shrink: 0;
}

.mtp-seg {
  display: flex;
  padding: 3px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  gap: 2px;
}

.mtp-seg-btn {
  flex: 1;
  padding: 7px 10px;
  text-align: center;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.7);
  border-radius: 7px;
  cursor: pointer;
  border: none;
  background: transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-seg-btn-active {
  background: rgba(109, 136, 168, 0.2);
  color: #e9edf5;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Body */
.mtp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 0 14px;
}

.mtp-body::-webkit-scrollbar {
  width: 0;
}

.mtp-section-label {
  padding: 8px 20px 6px;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 500;
}

.mtp-empty {
  padding: 28px 20px;
  text-align: center;
  color: rgba(247, 244, 236, 0.45);
  font-size: 12px;
}

/* Live card */
.mtp-live-card {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: rgba(109, 136, 168, 0.1);
  border: 1px solid rgba(109, 136, 168, 0.3);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(109, 136, 168, 0.25);
}

.mtp-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mtp-live-spinner {
  color: #a3b7cf;
  font-size: 12px;
}

.mtp-live-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #a3b7cf;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 500;
}

.mtp-live-model {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(109, 136, 168, 0.15);
  color: #bac9db;
  border: 1px solid rgba(109, 136, 168, 0.3);
}

.mtp-live-model i {
  font-size: 9px;
}

.mtp-live-text {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 12px;
  color: rgba(247, 244, 236, 0.85);
  line-height: 1.65;
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 72px;
  overflow: hidden;
}

.mtp-live-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.mtp-live-bar-fill {
  height: 100%;
  background: #a3b7cf;
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-live-meta {
  display: flex;
  justify-content: space-between;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 6px;
}

/* Stats */
.mtp-model-card {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.mtp-model-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mtp-model-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a3b7cf;
  flex-shrink: 0;
}

.mtp-model-name {
  font-size: 13px;
  color: rgba(247, 244, 236, 1);
  font-weight: 500;
}

.mtp-model-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  margin-left: auto;
}

.mtp-model-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.mtp-model-bar-fill {
  height: 100%;
  background: rgba(163, 183, 207, 0.7);
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-model-meta {
  display: flex;
  gap: 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
}

.mtp-totals {
  margin: 0 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mtp-total {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.mtp-total-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.mtp-total-label {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.mtp-total-icon {
  color: rgba(174, 183, 198, 0.85);
  font-size: 11px;
  opacity: 0.7;
}

.mtp-total-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
}

/* Reuse desktop TaskTodos / TaskStream inside the mobile layout */
.mtp-todos-wrap {
  margin: 0 16px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
}

.mtp-stream-wrap {
  margin: 0 16px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  min-height: 240px;
}

.mtp-stream-wrap--compact {
  min-height: 160px;
  max-height: 220px;
}

/* TaskStream's .stream-section is flex column with flex:1 — fill the wrapper */
.mtp-stream-wrap :deep(.stream-section) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

/* 实时 tab 活动记录：只保留输出内容，隐藏工具栏 + 思考过程 */
.mtp-stream-wrap--compact :deep(.stream-header),
.mtp-stream-wrap--compact :deep(.thinking-block),
.mtp-stream-wrap--compact :deep(.completed-banner) {
  display: none;
}

.mtp-stream-wrap--compact :deep(.output-block) {
  margin: 0;
  border: none;
  background: transparent;
}

/* Bottom actions */
.mtp-actions {
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.72);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.mtp-actions-spacer {
  flex: 1;
}

.mtp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.mtp-btn i {
  font-size: 10px;
}

.mtp-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.mtp-btn-outline {
  background: rgba(255, 255, 255, 0.03);
  color: rgba(247, 244, 236, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.mtp-btn-outline:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.mtp-btn-danger {
  color: #ef5f5f;
  border-color: rgba(239, 95, 95, 0.3);
}

.mtp-btn-blue {
  background: rgba(109, 136, 168, 0.18);
  color: #bac9db;
  border-color: rgba(109, 136, 168, 0.35);
  box-shadow: 0 2px 8px rgba(109, 136, 168, 0.3);
}

.mtp-btn-blue:hover:not(:disabled) {
  background: rgba(109, 136, 168, 0.28);
}
</style>
