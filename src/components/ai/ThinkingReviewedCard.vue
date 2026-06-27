<script setup lang="ts">
/**
 * AI 思考过程面板里的「已完成任务」卡片。从 ThinkingProcessBody 拆出，
 * 把状态图标 :class 对象、各类 v-if 收进子组件，降低父模板圈复杂度。
 */
import Button from 'primevue/button';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { formatTaskDuration } from 'src/utils';

interface Props {
  task: AIProcessingTask;
  nowMs: number;
  onOpenDetail: (task: AIProcessingTask) => void;
}

const props = defineProps<Props>();

// 已完成任务只可能出现 end / error / cancelled 三态
const STATUS_ICON: Record<string, string> = {
  end: 'pi-check-circle text-green-500',
  error: 'pi-times-circle text-red-500',
  cancelled: 'pi-ban text-orange-500',
};

const statusIcon = (status: string): string => STATUS_ICON[status] ?? '';
const typeLabel = (type: AIProcessingTask['type']): string => TASK_TYPE_LABELS[type] || type;
const formatDuration = (startTime: number, endTime?: number): string =>
  formatTaskDuration(startTime, endTime, props.nowMs);

const hasThinking = (t: AIProcessingTask): boolean => !!t.thinkingMessage && t.thinkingMessage.trim() !== '';
</script>

<template>
  <div class="thinking-reviewed-card p-3 rounded-lg border border-white/5 bg-white/2">
    <div class="thinking-reviewed-head flex items-start justify-between mb-2 gap-2">
      <div class="thinking-reviewed-main flex items-center gap-2 flex-1 min-w-0">
        <i class="pi text-sm flex-shrink-0" :class="statusIcon(task.status)" />
        <span class="text-sm text-moon/70 truncate">{{ task.modelName }}</span>
        <span class="text-xs px-1.5 py-0.5 rounded bg-white/5 text-moon/50 flex-shrink-0">{{
          typeLabel(task.type)
        }}</span>
      </div>
      <span class="thinking-reviewed-duration text-xs text-moon/50 flex-shrink-0">{{
        formatDuration(task.startTime, task.endTime)
      }}</span>
      <Button
        v-if="hasThinking(task)"
        icon="pi pi-external-link"
        class="p-button-text p-button-sm p-button-rounded flex-shrink-0"
        :pt="{ root: { class: '!p-1 !min-w-0 !h-6 !w-6' } }"
        title="查看完整思考过程"
        aria-label="查看完整思考过程"
        @click="onOpenDetail(task)"
      />
    </div>
    <p v-if="task.message" class="text-xs text-moon/60 mb-2 break-words">
      {{ task.message }}
    </p>
    <div v-if="hasThinking(task)" class="mt-2 p-2 rounded bg-white/3 border border-white/5">
      <p class="text-xs text-moon/50 mb-1">思考过程：</p>
      <p
        class="text-xs text-moon/70 whitespace-pre-wrap break-words max-h-24 overflow-y-auto"
        style="word-break: break-all; overflow-wrap: anywhere"
      >
        {{ task.thinkingMessage }}
      </p>
    </div>
    <div class="flex items-center gap-2 mt-2 text-xs text-moon/50 break-words">
      <span v-if="task.endTime" class="break-words">
        完成于 {{ new Date(task.endTime).toLocaleString('zh-CN') }}
      </span>
    </div>
  </div>
</template>
