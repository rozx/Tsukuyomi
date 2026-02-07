<script setup lang="ts">
import Popover from 'primevue/popover';
import { computed } from 'vue';
import type { ChatSession } from 'src/stores/chat-sessions';

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
  target: string;
}

const props = defineProps<Props>();
const popoverRef = defineModel<InstanceType<typeof Popover> | null>('popoverRef');

const emit = defineEmits<{
  hide: [];
  select: [sessionId: string];
}>();

const formatSessionTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
};

const sessionCount = computed(() => props.sessions.length);
</script>

<template>
  <Popover
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
        <span class="popover-title">最近会话</span>
        <span
          v-if="sessionCount > 0"
          class="px-1.5 py-0.5 text-xs font-medium rounded bg-primary-500/30 text-primary-200"
        >
          {{ sessionCount }}
        </span>
      </div>
      <div v-if="sessionCount === 0" class="px-4 py-3 text-xs text-moon-60 text-center">
        暂无其他会话
      </div>
      <div v-else class="popover-sessions-list">
        <button
          v-for="session in props.sessions"
          :key="session.id"
          class="session-item"
          :class="{ 'session-item-active': session.id === props.currentSessionId }"
          @click="emit('select', session.id)"
        >
          <div class="session-item-header">
            <span class="session-item-title" :title="session.title">
              {{ session.title }}
            </span>
            <span class="session-item-time">
              {{ formatSessionTime(session.updatedAt) }}
            </span>
          </div>
          <div v-if="session.messages.length > 0" class="session-item-meta">
            <span class="text-xs text-moon-60">{{ session.messages.length }} 条消息</span>
          </div>
        </button>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
/* Session List Popover 样式 */
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

.popover-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.session-item {
  width: 100%;
  text-align: left;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.session-item-active {
  background: rgba(var(--primary-rgb), 0.2);
  border-color: rgba(var(--primary-rgb), 0.4);
}

.session-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.session-item-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item-active .session-item-title {
  color: var(--moon-opacity-100);
  font-weight: 600;
}

.session-item-time {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  flex-shrink: 0;
}

.session-item-meta {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}
</style>
