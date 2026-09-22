<script setup lang="ts">
/**
 * 导入任务列表：创建、切换与删除任务。桌面作为左侧栏，手机作为「任务」分段。
 * 删除只清理任务自身的来源、对话和撤销记录，不删除已导入的小说。
 */
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { injectImportPage } from 'src/composables/import-page/useImportPage';
import type { ImportTask } from 'src/models/import';
import { TASK_STATE, formatTime } from './import-labels';

const ctx = injectImportPage();
const store = ctx.store;
const confirm = useConfirm();

const isActive = (task: ImportTask) => task.id === store.selectedTaskId;
const isRunningElsewhere = (task: ImportTask) => store.runningTaskId === task.id;

const confirmDelete = (task: ImportTask) => {
  confirm.require({
    header: '删除导入任务',
    message: `删除「${task.name}」会清除它的来源、提取结果、对话和撤销记录，已导入书库的小说不会被删除。删除后将无法再撤销该任务的导入。`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: '删除任务',
    rejectLabel: '取消',
    acceptClass: 'p-button-danger',
    accept: () => void ctx.deleteTask(task.id),
  });
};
</script>

<template>
  <section class="itl" aria-label="导入任务">
    <header class="itl-head">
      <span class="itl-title">导入任务</span>
      <Button
        icon="pi pi-plus"
        label="新任务"
        size="small"
        class="itl-new"
        @click="ctx.createTask"
      />
    </header>

    <p v-if="!store.tasks.length" class="itl-empty">
      还没有导入任务。新建一个任务，提供网址或文件后与月詠一起整理。
    </p>

    <ul v-else class="itl-list">
      <li v-for="task in store.tasks" :key="task.id">
        <div
          class="itl-item"
          :class="{ 'itl-item--active': isActive(task) }"
          role="button"
          tabindex="0"
          :aria-current="isActive(task) ? 'true' : undefined"
          @click="ctx.openTask(task.id)"
          @keydown.enter="ctx.openTask(task.id)"
        >
          <div class="itl-item-main">
            <span class="itl-item-name">{{ task.name }}</span>
            <span class="itl-item-meta">
              {{ formatTime(task.updatedAt) }} · {{ task.draft.chapters.length }} 章草稿
            </span>
          </div>
          <div class="itl-item-side">
            <i
              v-if="isRunningElsewhere(task)"
              class="pi pi-spin pi-spinner itl-running"
              aria-label="月詠正在处理"
            />
            <Tag
              :value="TASK_STATE[task.state].label"
              :severity="TASK_STATE[task.state].severity"
              class="itl-tag"
            />
            <button
              type="button"
              class="itl-delete"
              :aria-label="`删除任务 ${task.name}`"
              @click.stop="confirmDelete(task)"
            >
              <i class="pi pi-trash" aria-hidden="true" />
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.itl {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.itl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0.25rem 0.75rem;
}

.itl-title {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--moon-50-opacity-70, rgba(226, 232, 240, 0.7));
}

.itl-empty {
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgba(226, 232, 240, 0.55);
  padding: 0.5rem 0.25rem;
}

.itl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
  min-height: 0;
}

.itl-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.7rem;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 160ms ease;
}

.itl-item:hover,
.itl-item:focus-visible {
  background: rgba(255, 255, 255, 0.05);
  outline: none;
}

.itl-item--active {
  background: rgba(99, 102, 241, 0.14);
  border-color: rgba(129, 140, 248, 0.35);
}

.itl-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.itl-item-name {
  font-size: 0.875rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.itl-item-meta {
  font-size: 0.7rem;
  color: rgba(226, 232, 240, 0.5);
}

.itl-item-side {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.itl-tag {
  font-size: 0.65rem;
}

.itl-running {
  font-size: 0.8rem;
  color: rgb(165, 180, 252);
}

.itl-delete {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: rgba(226, 232, 240, 0.45);
  opacity: 0;
  transition: opacity 160ms ease;
}

.itl-item:hover .itl-delete,
.itl-item--active .itl-delete,
.itl-delete:focus-visible {
  opacity: 1;
}

.itl-delete:hover {
  color: rgb(252, 165, 165);
  background: rgba(239, 68, 68, 0.12);
}

@media (hover: none) {
  .itl-delete {
    opacity: 1;
  }
}
</style>
