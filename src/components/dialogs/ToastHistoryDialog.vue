<script setup lang="ts">
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import { useToastHistory, type ToastHistoryItem } from 'src/composables/useToastHistory';

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

const { historyItems, clearHistory, removeHistoryItem, formatTimestamp, markAsRead, revert, canRevert } = useToastHistory();

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
  void clearHistory();
};

const handleRevert = async (id: string) => {
  await revert(id);
};

const toggle = (event: Event) => {
  popoverRef.value?.toggle(event);
};

// 监听 popup 显示，标记为已读
const handleShow = () => {
  void markAsRead();
};

// 暴露方法供父组件调用
defineExpose({
  toggle,
});
</script>

<template>
  <Popover
    ref="popoverRef"
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
          <Select
            v-model="selectedSeverity"
            :options="severityOptions"
            optionLabel="label"
            optionValue="value"
            class="min-w-32 p-inputtext-sm"
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
                        <Tag
                          v-if="item.reverted"
                          value="已撤销"
                          severity="info"
                          class="text-xs opacity-70"
                        />
                      </div>
                      <div class="flex items-center gap-1">
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
  </Popover>
</template>

<style scoped>
.toast-history-overlay :deep(.p-popover-content) {
  padding: 1rem;
}

/* 确保 Select 下拉框文本不被截断 */
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
</style>
