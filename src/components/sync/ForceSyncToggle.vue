<script setup lang="ts">
/**
 * 强制推送模式 toggle
 *
 * 共享组件，同时出现在：
 *   - SyncSettingsTab（设置页）
 *   - SyncStatusBody（顶栏同步面板 / 手机 BottomSheet）
 *
 * 两处通过 Pinia 共享 `settingsStore.forceSyncMode` 状态，任一处切换立即反映到另一处。
 * 关闭 toggle 时同时清除 lastFailedAt。
 */
import { computed } from 'vue';
import Checkbox from 'primevue/checkbox';
import { useSettingsStore } from 'src/stores/settings';

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const settingsStore = useSettingsStore();

const active = computed({
  get: () => settingsStore.forceSyncMode.active,
  set: (value: boolean) => {
    // 关闭 toggle 时 store mutator 会自动清除 lastFailedAt
    void settingsStore.updateForceSyncMode({ active: value });
  },
});

const hasFailure = computed(
  () => settingsStore.forceSyncMode.active && !!settingsStore.forceSyncMode.lastFailedAt,
);
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-start gap-2">
      <Checkbox
        :binary="true"
        :model-value="active"
        input-id="force-sync-mode"
        :disabled="props.disabled"
        @update:model-value="(value) => (active = value as boolean)"
      />
      <label for="force-sync-mode" class="flex-1 cursor-pointer">
        <div class="text-xs text-moon/90 leading-tight">强制推送本地数据到远程（覆盖远程）</div>
        <div class="text-[10px] text-moon/60 mt-0.5 leading-snug">
          开启后，点击同步会将本地数据完全覆盖远程，远程上本地没有的条目将被删除
        </div>
      </label>
    </div>
    <div
      v-if="hasFailure"
      class="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/30"
    >
      <i class="pi pi-exclamation-triangle text-red-400 text-xs" />
      <span class="text-[10px] text-red-300 leading-tight">
        上次强制推送失败 —— 点击同步重试，或关闭 toggle 退出
      </span>
    </div>
  </div>
</template>
