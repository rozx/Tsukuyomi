<script setup lang="ts">
/**
 * 同步状态面板的「下次同步时间」区块。从 SyncStatusBody 拆出，
 * 把 v-if/v-else-if/v-else 四分支链搬进子组件，降低父模板圈复杂度。
 */
import { computed } from 'vue';
import { formatRelativeTime } from 'src/utils/format';

interface Props {
  enabled: boolean;
  nextSyncTime: number | null | undefined;
  nowMs: number;
}

const props = defineProps<Props>();

const formatNextSyncTime = computed(() => {
  const next = props.nextSyncTime;
  if (!next) return '未设置';
  const diff = next - props.nowMs;
  if (diff <= 0) return '即将同步';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours} 小时后`;
  if (minutes > 0) return `${minutes} 分钟后`;
  return '即将同步';
});

const showRelative = computed(() => props.enabled && !!props.nextSyncTime);
</script>

<template>
  <div>
    <label class="text-xs text-moon/60">下次同步时间</label>
    <p v-if="enabled && nextSyncTime" class="text-sm text-moon/90 mt-1">
      {{ formatNextSyncTime }}
    </p>
    <p v-else-if="enabled" class="text-sm text-moon/70 mt-1">未设置自动同步</p>
    <p v-else class="text-sm text-moon/70 mt-1">未启用</p>
    <p v-if="showRelative" class="text-xs text-moon/50 mt-1">
      {{ formatRelativeTime(nextSyncTime!, nowMs) }}
    </p>
  </div>
</template>
