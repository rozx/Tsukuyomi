<script setup lang="ts">
/**
 * 单个 Action 的详情面板 —— 桌面 Popover、手机 MobileBottomSheet。
 * 对外仍暴露 `toggle(event)` / `hide()`，兼容 useRightPanel 对 Ref 的既有调用。
 */
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';
import MobileBottomSheet from './MobileBottomSheet.vue';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';
import { getActionDetails, ACTION_LABELS, ENTITY_LABELS } from 'src/utils/action-info-utils';

interface Props {
  action: MessageAction | null;
  context: ActionDetailsContext;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  hide: [];
}>();

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const mobileVisible = ref(false);

const getActionTitle = (action: MessageAction): string =>
  `${ACTION_LABELS[action.type] ?? ''}${ENTITY_LABELS[action.entity] ?? ''}`;

const title = computed(() => (props.action ? getActionTitle(props.action) : ''));

const onMobileVisibleChange = (visible: boolean) => {
  const wasOpen = mobileVisible.value;
  mobileVisible.value = visible;
  if (wasOpen && !visible) emit('hide');
};

defineExpose({
  toggle: (event: Event) => {
    if (isPhone.value) {
      mobileVisible.value = !mobileVisible.value;
    } else {
      popoverRef.value?.toggle(event);
    }
  },
  hide: () => {
    if (isPhone.value) {
      if (mobileVisible.value) {
        mobileVisible.value = false;
        emit('hide');
      }
    } else {
      popoverRef.value?.hide();
    }
  },
});
</script>

<template>
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    style="width: 18rem; max-width: 90vw"
    class="action-popover"
    @hide="emit('hide')"
  >
    <div v-if="props.action" class="action-popover-content">
      <div class="popover-header">
        <span class="popover-title">{{ getActionTitle(props.action) }}</span>
      </div>
      <div class="popover-details">
        <div
          v-for="(detail, detailIdx) in getActionDetails(props.action, props.context)"
          :key="detailIdx"
          class="popover-detail-item"
        >
          <span class="popover-detail-label">{{ detail.label }}：</span>
          <span class="popover-detail-value">{{ detail.value }}</span>
        </div>
      </div>
    </div>
  </Popover>

  <MobileBottomSheet
    v-else
    :visible="mobileVisible"
    :title="title || '操作详情'"
    eyebrow="CHAT · ACTION"
    max-height="70dvh"
    @update:visible="onMobileVisibleChange"
  >
    <div v-if="props.action" class="popover-details">
      <div
        v-for="(detail, detailIdx) in getActionDetails(props.action, props.context)"
        :key="detailIdx"
        class="popover-detail-item"
      >
        <span class="popover-detail-label">{{ detail.label }}：</span>
        <span class="popover-detail-value">{{ detail.value }}</span>
      </div>
    </div>
  </MobileBottomSheet>
</template>

<style scoped>
:deep(.action-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.action-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.popover-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.popover-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
}

.popover-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.popover-detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
}

.popover-detail-label {
  color: var(--moon-opacity-70);
  font-weight: 500;
}

.popover-detail-value {
  color: var(--moon-opacity-90);
  word-break: break-word;
  line-height: 1.5;
}
</style>
