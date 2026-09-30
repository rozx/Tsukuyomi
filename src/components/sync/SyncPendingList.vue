<script setup lang="ts">
/**
 * 同步状态面板的「待同步变更」列表区块。从 SyncStatusBody 拆出，
 * 把 v-for + action 颜色三元等搬进子组件，降低父模板圈复杂度。
 */
import type { PendingChangeItem } from 'src/composables/useSyncPendingChanges';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface Props {
  enabled: boolean;
  hasPendingChanges: boolean;
  pendingCount: number;
  visiblePendingItems: PendingChangeItem[];
  hiddenPendingCount: number;
}

defineProps<Props>();

const kindIcon: Record<string, string> = {
  book: 'pi pi-book',
  'ai-model': 'pi pi-cog',
  cover: 'pi pi-image',
  settings: 'pi pi-sliders-h',
  memory: 'pi pi-database',
};

// 按 action 查颜色 class，避免模板里写三元
const actionColorClass = (action: PendingChangeItem['action']): string =>
  action === 'deleted' ? 'text-rose-300/80' : 'text-moon/50';
</script>

<template>
  <div v-if="enabled && hasPendingChanges" class="pt-2 border-t border-white/10 space-y-2">
    <div class="flex items-center justify-between">
      <label class="text-xs text-moon/60">{{ t('syncUi.panel.pending') }}</label>
      <span class="text-xs text-amber-300">
        {{ t('syncUi.panel.pendingCount', { count: pendingCount }) }}
      </span>
    </div>
    <ul class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
      <li
        v-for="(item, idx) in visiblePendingItems"
        :key="`${item.kind}-${item.label}-${idx}`"
        class="flex items-center gap-2 text-xs text-moon/85 min-w-0"
      >
        <i :class="kindIcon[item.kind]" class="text-moon/60 shrink-0" />
        <span class="text-moon/50 shrink-0">{{ t(`syncUi.panel.kind.${item.kind}`) }}</span>
        <span class="truncate flex-1 min-w-0" :title="item.label">{{ item.label }}</span>
        <span class="text-[10px] shrink-0" :class="actionColorClass(item.action)">
          {{ t(`syncUi.panel.action.${item.action}`) }}
        </span>
      </li>
    </ul>
    <p v-if="hiddenPendingCount > 0" class="text-xs text-moon/50">
      {{ t('syncUi.panel.moreHidden', { count: hiddenPendingCount }) }}
    </p>
  </div>
</template>
