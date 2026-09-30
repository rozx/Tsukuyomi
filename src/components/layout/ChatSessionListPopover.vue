<script setup lang="ts">
/**
 * 最近会话列表 —— 桌面 Popover、手机 MobileBottomSheet。
 *
 * 对外暴露 `toggle(event)` 与 `hide()`，兼容 useRightPanel 里对
 * sessionListPopoverRef 的既有调用（parent 拿 template ref 后直接调方法）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppLocale } from 'src/models/locale';
import { sessionDisplayTitle } from 'src/constants/chat';
import Popover from 'primevue/popover';
import MobileBottomSheet from './MobileBottomSheet.vue';
import ChatSessionRows from './ChatSessionRows.vue';
import { usePopoverBottomSheet } from 'src/composables/layout/usePopoverBottomSheet';
import type { ChatSession } from 'src/stores/chat-sessions';

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
  /** Popover 的目标元素选择器（仅桌面使用） */
  target: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  hide: [];
  select: [sessionId: string];
}>();

const { isPhone, popoverRef, mobileVisible, onMobileVisibleChange, toggle, hide } =
  usePopoverBottomSheet(() => emit('hide'));
const { t, locale } = useI18n();

// 默认会话标题是存储哨兵，按当前界面语言显示；用户消息生成的标题原样显示
const displayTitle = (title: string): string =>
  sessionDisplayTitle(title, locale.value as AppLocale);

const formatSessionTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('activityUi.chat.justNow');
  if (minutes < 60) return t('activityUi.chat.minutesAgo', { count: minutes });
  if (hours < 24) return t('activityUi.chat.hoursAgo', { count: hours });
  if (days < 7) return t('activityUi.chat.daysAgo', { count: days });

  return new Date(timestamp).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
  });
};

const sessionCount = computed(() => props.sessions.length);

// 显示用行数据：标题 / 时间 / 消息数等固定标签随界面语言重绘，桌面与手机共用。
// 用函数而非 computed：相对时间依赖 Date.now()，每次渲染（如重新打开面板）都要重新计算
const sessionRows = () =>
  props.sessions.map((session) => ({
    id: session.id,
    title: displayTitle(session.title),
    time: formatSessionTime(session.updatedAt),
    count: session.messages.length,
    countLabel: t('activityUi.chat.messageCount', { count: session.messages.length }),
  }));

const onSelect = (sessionId: string) => {
  emit('select', sessionId);
  // 选中会话后统一关闭 popover / sheet，避免切换后列表仍覆盖在页面上方
  hide();
};

defineExpose({ toggle, hide });
</script>

<template>
  <!-- 桌面：Popover 贴在触发按钮旁 -->
  <Popover
    v-if="!isPhone"
    ref="popoverRef"
    :dismissable="true"
    :show-close-icon="false"
    :target="props.target"
    style="width: 20rem; max-width: 90vw"
    class="session-list-popover"
    @hide="emit('hide')"
  >
    <div class="session-list-popover-content">
      <div class="popover-header">
        <span class="popover-title">{{ t('activityUi.chat.recentSessions') }}</span>
        <span
          v-if="sessionCount > 0"
          class="px-1.5 py-0.5 text-xs font-medium rounded bg-primary-500/30 text-primary-200"
        >
          {{ sessionCount }}
        </span>
      </div>
      <div v-if="sessionCount === 0" class="px-4 py-3 text-xs text-moon-60 text-center">
        {{ t('activityUi.chat.noOtherSessions') }}
      </div>
      <ChatSessionRows
        v-else
        :rows="sessionRows()"
        :current-session-id="props.currentSessionId"
        @select="onSelect"
      />
    </div>
  </Popover>

  <!-- 手机：底部抽屉 -->
  <MobileBottomSheet
    v-else
    :visible="mobileVisible"
    :title="t('activityUi.chat.recentSessions')"
    eyebrow="CHAT · SESSIONS"
    max-height="82dvh"
    @update:visible="onMobileVisibleChange"
  >
    <div v-if="sessionCount === 0" class="px-4 py-8 text-sm text-moon-60 text-center">
      {{ t('activityUi.chat.noOtherSessions') }}
    </div>
    <ChatSessionRows
      v-else
      :rows="sessionRows()"
      :current-session-id="props.currentSessionId"
      @select="onSelect"
    />
  </MobileBottomSheet>
</template>

<style scoped>
:deep(.session-list-popover .p-popover-content) {
  padding: 0.75rem 1rem;
}

.session-list-popover-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 20rem;
  overflow-y: auto;
}

.session-list-popover-content .popover-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.session-list-popover-content .popover-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
}
</style>
