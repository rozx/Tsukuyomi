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
import { computed, useId } from 'vue';
import Checkbox from 'primevue/checkbox';
import { useSettingsStore } from 'src/stores/settings';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const settingsStore = useSettingsStore();

// 组件可能同时渲染在设置页和同步面板，必须用 per-instance id 避免重复 DOM id 破坏 label 关联
const inputId = useId();

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
        :input-id="inputId"
        :disabled="props.disabled"
        @update:model-value="(value) => (active = value as boolean)"
      />
      <label :for="inputId" class="flex-1 cursor-pointer">
        <div class="text-xs text-moon/90 leading-tight">
          {{ t('syncUi.panel.force.title') }}
        </div>
        <div class="text-[10px] text-moon/60 mt-0.5 leading-snug">
          {{ t('syncUi.panel.force.hint') }}
        </div>
      </label>
    </div>
    <div
      v-if="hasFailure"
      class="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/30"
    >
      <i class="pi pi-exclamation-triangle text-red-400 text-xs" />
      <span class="text-[10px] text-red-300 leading-tight">
        {{ t('syncUi.panel.force.failed') }}
      </span>
    </div>
  </div>
</template>
