<script setup lang="ts">
/**
 * 最近会话列表行。桌面 Popover 与手机 MobileBottomSheet 共用同一份行模板，
 * 行数据（标题、相对时间、消息数标签）由父组件按界面语言派生。
 */
interface ChatSessionRow {
  id: string;
  title: string;
  time: string;
  count: number;
  countLabel: string;
}

defineProps<{
  rows: ChatSessionRow[];
  currentSessionId: string | null;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
}>();
</script>

<template>
  <div class="popover-sessions-list">
    <button
      v-for="row in rows"
      :key="row.id"
      class="session-item"
      :class="{ 'session-item-active': row.id === currentSessionId }"
      @click="emit('select', row.id)"
    >
      <div class="session-item-header">
        <span class="session-item-title" :title="row.title">{{ row.title }}</span>
        <span class="session-item-time">{{ row.time }}</span>
      </div>
      <div v-if="row.count > 0" class="session-item-meta">
        <span class="text-xs text-moon-60">{{ row.countLabel }}</span>
      </div>
    </button>
  </div>
</template>

<style scoped>
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
