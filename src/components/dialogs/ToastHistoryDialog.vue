<script setup lang="ts">
import { computed, ref } from 'vue';
import OverlayPanel from 'primevue/overlaypanel';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import Dropdown from 'primevue/dropdown';
import { useToastHistory, type ToastHistoryItem } from 'src/composables/useToastHistory';

const overlayPanelRef = ref<InstanceType<typeof OverlayPanel> | null>(null);

const { historyItems, clearHistory, removeHistoryItem, formatTimestamp, markAsRead } = useToastHistory();

const selectedSeverity = ref<'all' | ToastHistoryItem['severity']>('all');

const severityOptions = [
  { label: '全部', value: 'all' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '成功', value: 'success' },
  { label: '信息', value: 'info' },
];

// 按时间倒序排列并过滤
const sortedHistoryItems = computed(() => {
  let items = [...historyItems.value];

  if (selectedSeverity.value !== 'all') {
    items = items.filter((item) => item.severity === selectedSeverity.value);
  }

  return items.sort((a, b) => b.timestamp - a.timestamp);
});

// 严重程度图标映射
const severityIcons: Record<ToastHistoryItem['severity'], string> = {
  success: 'pi pi-check-circle',
  error: 'pi pi-times-circle',
  info: 'pi pi-info-circle',
  warn: 'pi pi-exclamation-triangle',
};

// 严重程度标签颜色映射
const severityTags: Record<ToastHistoryItem['severity'], 'success' | 'danger' | 'info' | 'warn'> = {
  success: 'success',
  error: 'danger',
  info: 'info',
  warn: 'warn',
};

const handleClear = () => {
  clearHistory();
};

const toggle = (event: Event) => {
  overlayPanelRef.value?.toggle(event);
};

// 监听 popup 显示，标记为已读
const handleShow = () => {
  markAsRead();
};

// 暴露方法供父组件调用
defineExpose({
  toggle,
});
</script>

<template>
  <OverlayPanel
    ref="overlayPanelRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 500px; max-height: 600px"
    class="toast-history-overlay"
    @show="handleShow"
  >
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-semibold text-moon/90">消息历史</h3>
          <Dropdown
            v-model="selectedSeverity"
            :options="severityOptions"
            optionLabel="label"
            optionValue="value"
            class="w-28 p-inputtext-sm !h-8"
            placeholder="筛选"
          />
        </div>
        <Button
          v-if="historyItems.length > 0"
          icon="pi pi-trash"
          class="p-button-text p-button-danger p-button-sm"
          title="清空所有历史"
          @click="handleClear"
        />
      </div>

      <!-- 历史记录列表 -->
      <div class="flex-1 overflow-auto min-h-0" style="max-height: 500px">
        <DataView
          :value="sortedHistoryItems"
          data-key="id"
          :paginator="sortedHistoryItems.length > 10"
          :rows="10"
          :rows-per-page-options="[5, 10, 20, 50]"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
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
                class="p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div class="flex items-start gap-3">
                  <!-- 图标 -->
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

                  <!-- 内容 -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-2">
                        <h4 class="font-medium text-moon/90">{{ item.summary }}</h4>
                        <Tag
                          :value="item.severity === 'success' ? '成功' : item.severity === 'error' ? '错误' : item.severity === 'info' ? '信息' : '警告'"
                          :severity="severityTags[item.severity as ToastHistoryItem['severity']]"
                          class="text-xs"
                        />
                      </div>
                      <Button
                        icon="pi pi-times"
                        class="p-button-text p-button-sm p-button-rounded flex-shrink-0"
                        @click="removeHistoryItem(item.id)"
                      />
                    </div>
                    <p class="text-sm text-moon/70 mb-2">{{ item.detail }}</p>
                    <p class="text-xs text-moon/50">{{ formatTimestamp(item.timestamp) }}</p>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </DataView>
      </div>
    </div>
  </OverlayPanel>
</template>

<style scoped>
.toast-history-overlay :deep(.p-overlaypanel-content) {
  padding: 1rem;
}
</style>

