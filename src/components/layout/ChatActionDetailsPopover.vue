<script setup lang="ts">
/**
 * 单个 Action 的详情面板 —— 桌面 Popover、手机 MobileBottomSheet。
 * 对外仍暴露 `toggle(event)` / `hide()`，兼容 useRightPanel 对 Ref 的既有调用。
 */
import { computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppLocale } from 'src/models/locale';
import Popover from 'primevue/popover';
import MobileBottomSheet from './MobileBottomSheet.vue';
import ChatActionDetailRows from './ChatActionDetailRows.vue';
import { usePopoverBottomSheet } from 'src/composables/layout/usePopoverBottomSheet';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';
import { getActionDetails, actionSummaryLabel } from 'src/utils/action-info-utils';

interface Props {
  action: MessageAction | null;
  context: ActionDetailsContext;
}

const props = defineProps<Props>();
const { t, locale } = useI18n();

const emit = defineEmits<{
  hide: [];
}>();

const {
  isPhone,
  popoverRef,
  mobileVisible,
  onMobileVisibleChange,
  toggle: toggleSurface,
  hide: hideSurface,
} = usePopoverBottomSheet(() => emit('hide'));

let hideTimer: ReturnType<typeof setTimeout> | undefined;
function cancelHide() {
  clearTimeout(hideTimer);
  hideTimer = undefined;
}
function hide() {
  cancelHide();
  if (!isPhone.value && props.action?.descriptionDetails?.length)
    hideTimer = setTimeout(hideSurface, 220);
  else hideSurface();
}
function toggle(event: Event) {
  cancelHide();
  toggleSurface(event);
}
onBeforeUnmount(cancelHide);

const getActionTitle = (action: MessageAction): string =>
  action.nameIsDescription
    ? t('activityUi.detailsTitle')
    : actionSummaryLabel(locale.value as AppLocale, action.type, action.entity);

const title = computed(() => (props.action ? getActionTitle(props.action) : ''));
// 详情标签随界面语言重绘；存储的名称/说明等自由文本原样展示
const details = computed(() =>
  props.action
    ? getActionDetails(props.action, props.context, locale.value as AppLocale).map((d) => ({
        label: t('activityUi.detailLabel', { label: d.label }),
        value: d.value,
      }))
    : [],
);

defineExpose({ toggle, hide });
</script>

<template>
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    :style="{
      width: props.action?.descriptionDetails?.length ? '28rem' : '18rem',
      maxWidth: '90vw',
    }"
    class="action-popover"
    @hide="emit('hide')"
  >
    <div
      v-if="props.action"
      class="action-popover-content"
      @mouseenter="cancelHide"
      @mouseleave="hide"
    >
      <div class="popover-header">
        <span class="popover-title">{{ getActionTitle(props.action) }}</span>
      </div>
      <ChatActionDetailRows :details="details" />
    </div>
  </Popover>

  <MobileBottomSheet
    v-else
    :visible="mobileVisible"
    :title="title || t('activityUi.detailsTitle')"
    eyebrow="CHAT · ACTION"
    max-height="70dvh"
    @update:visible="onMobileVisibleChange"
  >
    <ChatActionDetailRows v-if="props.action" :details="details" />
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
</style>
