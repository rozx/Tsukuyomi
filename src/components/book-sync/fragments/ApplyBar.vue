<script setup lang="ts">
/** 应用栏：当前勾选的数量、会话内撤销与应用入口（应用前先弹出确认摘要）。 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { summary, selected, working, canUndo, target, requestApply, undo } = injectBookSync();

const creating = computed(() => !!target.value && 'newFrom' in target.value);
</script>

<template>
  <div class="ab" data-testid="bsw-apply-bar">
    <span class="ab-text">
      已选 {{ summary.newCount }} 章新章节 · {{ summary.updatedCount }} 章更新
      <span v-if="summary.clearedVersions" class="ab-loss">
        · 将清空 {{ summary.clearedVersions }} 个译文版本
      </span>
    </span>
    <span class="ab-actions">
      <Button
        v-if="canUndo"
        label="撤销本次同步"
        icon="pi pi-undo"
        size="small"
        severity="secondary"
        text
        :disabled="working"
        @click="undo()"
      />
      <Button
        :label="creating ? '应用并创建书籍' : '应用到书籍'"
        icon="pi pi-check"
        size="small"
        :disabled="selected.size === 0 || working"
        @click="requestApply()"
      />
    </span>
  </div>
</template>

<style scoped>
.ab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.65rem 0.9rem;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}

.ab-text {
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.8);
}

.ab-loss {
  color: rgb(253, 186, 116);
}

.ab-actions {
  display: flex;
  gap: 0.4rem;
  margin-left: auto;
}
</style>
