<script setup lang="ts">
import Popover from 'primevue/popover';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';
import { getActionDetails, ACTION_LABELS, ENTITY_LABELS } from 'src/utils/action-info-utils';

interface Props {
  action: MessageAction | null;
  context: ActionDetailsContext;
}

const props = defineProps<Props>();
const popoverRef = defineModel<InstanceType<typeof Popover> | null>('popoverRef');

const emit = defineEmits<{
  hide: [];
}>();

const getActionTitle = (action: MessageAction): string => {
  return `${ACTION_LABELS[action.type] ?? ''}${ENTITY_LABELS[action.entity] ?? ''}`;
};
</script>

<template>
  <Popover
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
</template>

<style scoped>
/* Action Popover 样式 */
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
