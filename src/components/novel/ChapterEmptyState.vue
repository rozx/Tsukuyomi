<script setup lang="ts">
// 章节空状态：预览模式与默认模式各用一次。
</script>

<template>
  <div class="empty-chapter-content">
    <i class="pi pi-file empty-icon"></i>
    <p class="empty-text">该章节暂无内容</p>
    <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
  </div>
</template>

<style scoped>
/* 章节空状态样式。
 * 注：这些样式从 ChapterContentPanel.vue 迁移而来 —— 该面板把空状态抽成本组件后，
 * 其 scoped 样式无法穿透到子组件内部嵌套元素（仅子组件根元素继承父级 scope），
 * 导致 .empty-icon 等丢失样式。样式应与其消费的模板同处一个组件作用域。 */
.empty-chapter-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  color: var(--moon-opacity-40);
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  margin: 0 0 0.5rem 0;
}

.empty-hint {
  margin: 0;
}
</style>
