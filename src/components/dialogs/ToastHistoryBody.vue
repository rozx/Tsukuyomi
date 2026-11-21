<script setup lang="ts">
/**
 * 消息历史内容部分。从 ToastHistoryDialog 里拆出来，
 * 桌面 Popover 和手机 MobileBottomSheet 通过它共享完全相同的渲染逻辑。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DataView from 'primevue/dataview';
import Select from 'primevue/select';
import { useToastHistory, type ToastHistoryItem } from 'src/composables/useToastHistory';
import { useUiStore } from 'src/stores/ui';

const uiStore = useUiStore();
const { t } = useI18n();
const { historyItems, clearHistory, removeHistoryItem, formatTimestamp, revert, canRevert } =
  useToastHistory();

const selectedSeverity = ref<'all' | ToastHistoryItem['severity']>('all');
const isPhone = computed(() => uiStore.deviceType === 'phone');

const severityLabel = (severity: ToastHistoryItem['severity']): string =>
  t(`activityUi.toastHistory.${severity}`);

const severityOptions = computed(() => [
  { label: t('activityUi.toastHistory.all'), value: 'all' },
  { label: severityLabel('error'), value: 'error' },
  { label: severityLabel('warn'), value: 'warn' },
  { label: severityLabel('success'), value: 'success' },
  { label: severityLabel('info'), value: 'info' },
]);

const sortedHistoryItems = computed(() => {
  let items = [...historyItems.value];
  if (selectedSeverity.value !== 'all') {
    items = items.filter((item) => item.severity === selectedSeverity.value);
  }
  return items.sort((a, b) => b.timestamp - a.timestamp);
});

const severityIcons: Record<ToastHistoryItem['severity'], string> = {
  success: 'pi pi-check-circle',
  error: 'pi pi-times-circle',
  info: 'pi pi-info-circle',
  warn: 'pi pi-exclamation-triangle',
};

// 桌面的高度由 hp-panel 限制；手机抽屉里限制列表高度
const historyListStyle = computed(() => (isPhone.value ? { maxHeight: '58dvh' } : {}));
/** 桌面：hp 外壳的标题栏 / 滚动列表；手机：抽屉里的筛选行 + 列表 */
const layout = computed(() =>
  isPhone.value
    ? {
        root: 'flex flex-col h-full',
        head: 'toast-history-header flex items-center justify-between mb-3 pb-3 border-b border-white/10 gap-2',
        scroll: 'flex-1 overflow-auto min-h-0',
      }
    : { root: 'hp-panel', head: 'hp-head', scroll: 'hp-scroll th-scroll' },
);

const handleClear = () => {
  void clearHistory();
};

const handleRevert = async (id: string) => {
  await revert(id);
};
</script>

<template>
  <!-- 桌面用 header 弹层外壳（hp-*，与任务、同步弹层一致）；手机抽屉自带标题 -->
  <div :class="layout.root">
    <div :class="layout.head">
      <span v-if="!isPhone" class="hp-title">{{ t('activityUi.toastHistory.title') }}</span>
      <span v-if="!isPhone" class="hp-spacer" />
      <Select
        v-model="selectedSeverity"
        :options="severityOptions"
        optionLabel="label"
        optionValue="value"
        class="toast-history-filter p-inputtext-sm"
        :placeholder="t('activityUi.toastHistory.filter')"
      />
      <button
        v-if="historyItems.length > 0"
        type="button"
        class="hp-icon-btn hp-icon-btn--danger"
        :title="t('activityUi.toastHistory.clearAll')"
        :aria-label="t('activityUi.toastHistory.clearAll')"
        @click="handleClear"
      >
        <i class="pi pi-trash" aria-hidden="true" />
      </button>
    </div>

    <!-- 历史记录列表 -->
    <div :class="layout.scroll" :style="historyListStyle">
      <!-- 历史最多保留 100 条，直接滚动，不分页 -->
      <DataView :value="sortedHistoryItems" data-key="id">
        <template #empty>
          <div class="th-empty">
            <i class="pi pi-inbox" aria-hidden="true" />
            <p>{{ t('activityUi.toastHistory.empty') }}</p>
          </div>
        </template>

        <template #list="slotProps">
          <!-- 紧凑列表：颜色图标表示级别，标题 + 时间一行，详情最多三行；操作在悬停时出现 -->
          <ul class="th-list">
            <li
              v-for="item in slotProps.items"
              :key="item.id"
              class="th-row"
              :class="`th-row--${item.severity}`"
            >
              <i
                :class="[
                  severityIcons[item.severity as ToastHistoryItem['severity']],
                  'th-row-icon',
                ]"
                :title="severityLabel(item.severity as ToastHistoryItem['severity'])"
                aria-hidden="true"
              />
              <div class="th-row-main">
                <div class="th-row-top">
                  <span class="th-row-title">{{ item.summary }}</span>
                  <span v-if="item.reverted" class="th-row-tag">{{
                    t('activityUi.toastHistory.reverted')
                  }}</span>
                  <span class="th-row-time">{{ formatTimestamp(item.timestamp) }}</span>
                </div>
                <p v-if="item.detail" class="th-row-detail">{{ item.detail }}</p>
              </div>
              <div class="th-row-actions">
                <button
                  v-if="canRevert(item.id)"
                  type="button"
                  class="hp-icon-btn"
                  :title="t('activityUi.toastHistory.revert')"
                  :aria-label="t('activityUi.toastHistory.revert')"
                  @click="() => handleRevert(item.id)"
                >
                  <i class="pi pi-undo" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="hp-icon-btn hp-icon-btn--danger"
                  :title="t('activityUi.toastHistory.remove')"
                  :aria-label="t('activityUi.toastHistory.remove')"
                  @click="() => void removeHistoryItem(item.id)"
                >
                  <i class="pi pi-times" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>
        </template>
      </DataView>
    </div>
  </div>
</template>

<style scoped>
/* 行自带内边距，列表容器收窄，让行内文字与标题栏左边对齐 */
.th-scroll {
  padding: 6px 4px;
}

.th-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.th-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 6px 9px 8px;
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.th-row + .th-row {
  margin-top: 1px;
  box-shadow: 0 -1px 0 var(--white-opacity-6);
}

.th-row:hover {
  background: var(--white-opacity-3);
}

.th-row-icon {
  flex-shrink: 0;
  margin-top: 3px;
  font-size: 13px;
}

.th-row--success .th-row-icon {
  color: var(--color-success-300);
}

.th-row--error .th-row-icon {
  color: var(--color-danger-400);
}

.th-row--warn .th-row-icon {
  color: var(--color-warning-200);
}

.th-row--info .th-row-icon {
  color: var(--tsukuyomi-300);
}

.th-row-main {
  flex: 1;
  min-width: 0;
}

.th-row-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.th-row-title {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--moon-opacity-90);
  overflow-wrap: anywhere;
}

.th-row-tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10.5px;
  line-height: 16px;
  color: var(--btn-primary-color);
  background: var(--btn-primary-bg);
}

.th-row-time {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  white-space: nowrap;
  color: var(--moon-opacity-50);
}

.th-row-detail {
  display: -webkit-box;
  margin: 2px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 12px;
  line-height: 1.45;
  color: var(--moon-opacity-60);
  overflow-wrap: anywhere;
}

.th-row-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

/* 有悬停的设备上，操作按钮在悬停 / 键盘聚焦时才出现；触屏上一直显示 */
@media (hover: hover) {
  .th-row-actions {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .th-row:hover .th-row-actions,
  .th-row:focus-within .th-row-actions {
    opacity: 1;
  }
}

.th-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 2.5rem 0;
  font-size: 13px;
  color: var(--moon-opacity-60);
}

.th-empty .pi {
  font-size: 1.75rem;
  color: var(--moon-opacity-40);
}

:deep(.p-select) {
  min-width: 8rem;
}

:deep(.p-select .p-inputtext) {
  padding: 0.5rem 0.75rem;
  line-height: 1.5;
  white-space: nowrap;
  overflow: visible;
  text-overflow: ellipsis;
}

.toast-history-filter {
  width: 8rem;
  min-width: 8rem;
}

/* 标题栏里的筛选框与图标按钮同高（26px），标题栏高度与任务、同步弹层一致 */
.hp-head .toast-history-filter {
  height: 26px;
  align-items: center;
}

.hp-head .toast-history-filter :deep(.p-select-label) {
  padding: 0 0.6rem;
  font-size: 12px;
  line-height: 24px;
}

.hp-head .toast-history-filter :deep(.p-select-dropdown) {
  width: 1.75rem;
}

:deep(.p-select .p-select-label) {
  white-space: nowrap;
  overflow: visible;
}

@media (max-width: 640px) {
  .toast-history-header {
    margin-bottom: 0.75rem;
    padding-bottom: 0.65rem;
  }

  .toast-history-filter {
    width: 7.5rem;
    min-width: 7.5rem;
  }
}
</style>
