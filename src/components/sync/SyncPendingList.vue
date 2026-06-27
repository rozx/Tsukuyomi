<script setup lang="ts">
/**
 * 同步状态面板的「待同步变更」列表区块。从 SyncStatusBody 拆出，
 * 把 v-for + action 颜色三元等搬进子组件，降低父模板圈复杂度。
 */
import type { PendingChangeItem } from 'src/composables/useSyncPendingChanges';

interface Props {
  enabled: boolean;
  hasPendingChanges: boolean;
  pendingCount: number;
  visiblePendingItems: PendingChangeItem[];
  hiddenPendingCount: number;
}

defineProps<Props>();

const kindLabel: Record<string, string> = {
  book: '书籍',
  'ai-model': 'AI 模型',
  cover: '封面',
  settings: '设置',
  memory: '记忆',
};

const kindIcon: Record<string, string> = {
  book: 'pi pi-book',
  'ai-model': 'pi pi-cog',
  cover: 'pi pi-image',
  settings: 'pi pi-sliders-h',
  memory: 'pi pi-database',
};

const actionLabel: Record<'edited' | 'added' | 'deleted', string> = {
  edited: '已编辑',
  added: '新增',
  deleted: '删除',
};

// 按 action 查颜色 class，避免模板里写三元
const actionColorClass = (action: PendingChangeItem['action']): string =>
  action === 'deleted' ? 'text-rose-300/80' : 'text-moon/50';
</script>

<template>
  <div v-if="enabled && hasPendingChanges" class="pt-2 border-t border-white/10 space-y-2">
    <div class="flex items-center justify-between">
      <label class="text-xs text-moon/60">待同步变更</label>
      <span class="text-xs text-amber-300">{{ pendingCount }} 项</span>
    </div>
    <ul class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
      <li
        v-for="(item, idx) in visiblePendingItems"
        :key="`${item.kind}-${item.label}-${idx}`"
        class="flex items-center gap-2 text-xs text-moon/85 min-w-0"
      >
        <i :class="kindIcon[item.kind]" class="text-moon/60 shrink-0" />
        <span class="text-moon/50 shrink-0">{{ kindLabel[item.kind] }}</span>
        <span class="truncate flex-1 min-w-0" :title="item.label">{{ item.label }}</span>
        <span class="text-[10px] shrink-0" :class="actionColorClass(item.action)">
          {{ actionLabel[item.action] }}
        </span>
      </li>
    </ul>
    <p v-if="hiddenPendingCount > 0" class="text-xs text-moon/50">
      还有 {{ hiddenPendingCount }} 项未列出
    </p>
  </div>
</template>
