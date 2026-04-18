<script setup lang="ts">
/**
 * 批量 Action 列表面板（例如"创建 N 个待办"）—— 桌面 Popover、手机 MobileBottomSheet。
 */
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import { useUiStore } from 'src/stores/ui';
import MobileBottomSheet from './MobileBottomSheet.vue';
import type { MessageAction } from 'src/stores/chat-sessions';

interface Props {
  actions: MessageAction[] | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  hide: [];
}>();

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const mobileVisible = ref(false);

const title = computed(() => {
  const count = props.actions?.length ?? 0;
  return `创建 ${count} 个待办事项`;
});

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
    <div v-if="props.actions" class="action-popover-content">
      <div class="popover-header">
        <span class="popover-title">{{ title }}</span>
      </div>
      <div class="popover-details">
        <div
          v-for="(todoAction, todoIdx) in props.actions"
          :key="todoIdx"
          class="popover-detail-item"
        >
          <span class="popover-detail-label">{{ todoIdx + 1 }}.</span>
          <span class="popover-detail-value">{{ todoAction.name || '待办事项' }}</span>
        </div>
      </div>
    </div>
  </Popover>

  <MobileBottomSheet
    v-else
    :visible="mobileVisible"
    :title="title"
    eyebrow="CHAT · TODO BATCH"
    max-height="72dvh"
    @update:visible="onMobileVisibleChange"
  >
    <div v-if="props.actions" class="popover-details">
      <div
        v-for="(todoAction, todoIdx) in props.actions"
        :key="todoIdx"
        class="popover-detail-item popover-detail-item--row"
      >
        <span class="popover-detail-label">{{ todoIdx + 1 }}.</span>
        <span class="popover-detail-value">{{ todoAction.name || '待办事项' }}</span>
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

.popover-detail-item--row {
  flex-direction: row;
  gap: 0.5rem;
  align-items: flex-start;
}

.popover-detail-label {
  color: var(--moon-opacity-70);
  font-weight: 500;
  flex-shrink: 0;
}

.popover-detail-value {
  color: var(--moon-opacity-90);
  word-break: break-word;
  line-height: 1.5;
}
</style>
