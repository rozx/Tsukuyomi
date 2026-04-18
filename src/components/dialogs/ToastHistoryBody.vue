<script setup lang="ts">
/**
 * 消息历史内容部分。从 ToastHistoryDialog 里拆出来，
 * 桌面 Popover 和手机 MobileBottomSheet 通过它共享完全相同的渲染逻辑。
 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import { useToastHistory, type ToastHistoryItem } from 'src/composables/useToastHistory';
import { useUiStore } from 'src/stores/ui';

const uiStore = useUiStore();
const { historyItems, clearHistory, removeHistoryItem, formatTimestamp, revert, canRevert } =
  useToastHistory();

const selectedSeverity = ref<'all' | ToastHistoryItem['severity']>('all');
const isPhone = computed(() => uiStore.deviceType === 'phone');

const severityOptions = [
  { label: '全部', value: 'all' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '成功', value: 'success' },
  { label: '信息', value: 'info' },
];

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

const severityTags: Record<ToastHistoryItem['severity'], 'success' | 'danger' | 'info' | 'warn'> = {
  success: 'success',
  error: 'danger',
  info: 'info',
  warn: 'warn',
};

const historyListStyle = computed(() => ({
  maxHeight: isPhone.value ? '58dvh' : '500px',
}));

const rowsPerPageOptions = computed(() => (isPhone.value ? [5, 10] : [5, 10, 20, 50]));

const paginatorTemplate = computed(() =>
  isPhone.value
    ? 'PrevPageLink CurrentPageReport NextPageLink'
    : 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink',
);

const handleClear = () => {
  void clearHistory();
};

const handleRevert = async (id: string) => {
  await revert(id);
};
</script>

<template>
  <div class="flex flex-col h-full">
    <div
      class="toast-history-header flex items-center justify-between mb-4 pb-3 border-b border-white/10 flex-wrap gap-2"
    >
      <div class="toast-history-header-main flex items-center gap-3 min-w-0">
        <h3
          v-if="!isPhone"
          class="text-lg font-semibold text-moon/90 whitespace-nowrap"
        >
          消息历史
        </h3>
        <Select
          v-model="selectedSeverity"
          :options="severityOptions"
          optionLabel="label"
          optionValue="value"
          class="toast-history-filter min-w-32 p-inputtext-sm"
          placeholder="筛选"
        />
      </div>
      <Button
        v-if="historyItems.length > 0"
        icon="pi pi-trash"
        class="toast-history-actions p-button-text p-button-danger p-button-sm flex-shrink-0"
        title="清空所有历史"
        @click="handleClear"
      />
    </div>

    <!-- 历史记录列表 -->
    <div class="flex-1 overflow-auto min-h-0" :style="historyListStyle">
      <DataView
        :value="sortedHistoryItems"
        data-key="id"
        :paginator="sortedHistoryItems.length > 10"
        :rows="10"
        :rows-per-page-options="rowsPerPageOptions"
        :paginator-template="paginatorTemplate"
        current-page-report-template="{currentPage} / {totalPages}"
      >
        <template #empty>
          <div class="text-center py-12">
            <i class="pi pi-inbox text-4xl text-moon/50 mb-4" />
            <p class="text-moon/70">暂无消息历史</p>
          </div>
        </template>

        <template #list="slotProps">
          <div class="space-y-3">
            <div
              v-for="item in slotProps.items"
              :key="item.id"
              class="toast-history-item p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div class="flex items-start gap-3">
                <i
                  :class="[
                    severityIcons[item.severity as ToastHistoryItem['severity']],
                    'text-lg mt-0.5 flex-shrink-0',
                    {
                      'text-green-400': item.severity === 'success',
                      'text-red-400': item.severity === 'error',
                      'text-blue-400': item.severity === 'info',
                      'text-yellow-400': item.severity === 'warn',
                    },
                  ]"
                />

                <div class="flex-1 min-w-0">
                  <div class="toast-history-item-head flex items-center justify-between mb-1">
                    <div class="toast-history-item-meta flex items-center gap-2">
                      <h4 class="toast-history-item-title font-medium text-moon/90">
                        {{ item.summary }}
                      </h4>
                      <Tag
                        :value="
                          item.severity === 'success'
                            ? '成功'
                            : item.severity === 'error'
                              ? '错误'
                              : item.severity === 'info'
                                ? '信息'
                                : '警告'
                        "
                        :severity="severityTags[item.severity as ToastHistoryItem['severity']]"
                        class="text-xs"
                      />
                      <Tag
                        v-if="item.reverted"
                        value="已撤销"
                        severity="info"
                        class="text-xs opacity-70"
                      />
                    </div>
                    <div class="toast-history-item-actions flex items-center gap-1">
                      <Button
                        v-if="canRevert(item.id)"
                        icon="pi pi-undo"
                        class="p-button-text p-button-sm p-button-rounded flex-shrink-0 text-primary-400 hover:text-primary-300"
                        title="撤销操作"
                        @click="() => handleRevert(item.id)"
                      />
                      <Button
                        icon="pi pi-times"
                        class="p-button-text p-button-sm p-button-rounded flex-shrink-0 text-moon/50 hover:text-red-400"
                        title="删除记录"
                        @click="() => void removeHistoryItem(item.id)"
                      />
                    </div>
                  </div>
                  <p class="text-sm text-moon/70 mb-2 break-words">{{ item.detail }}</p>
                  <p class="text-xs text-moon/50">{{ formatTimestamp(item.timestamp) }}</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </DataView>
    </div>
  </div>
</template>

<style scoped>
.toast-history-item-title {
  overflow-wrap: anywhere;
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

:deep(.p-select .p-select-label) {
  white-space: nowrap;
  overflow: visible;
}

@media (max-width: 640px) {
  .toast-history-header {
    margin-bottom: 0.75rem;
    padding-bottom: 0.65rem;
  }

  .toast-history-header-main {
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 0.5rem;
  }

  .toast-history-filter {
    width: 7.5rem;
    min-width: 7.5rem;
  }

  .toast-history-actions {
    flex-shrink: 0;
  }

  .toast-history-item {
    padding: 0.75rem;
  }

  .toast-history-item-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .toast-history-item-meta {
    width: 100%;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .toast-history-item-title {
    font-size: 0.95rem;
    line-height: 1.35;
  }

  .toast-history-item-actions {
    align-self: flex-end;
    margin-left: 0;
  }
}
</style>
