<script setup lang="ts">
/**
 * 平板右侧竖向图标导航条——BookDetailsTablet / BooksPageTablet 共用。
 *
 * 只负责外壳（48px 宽 + 深色半透明背景 + 左边细线），按钮由调用方通过默认
 * slot 传入。按钮使用以下约定类名（由本组件的 `:slotted()` 样式接管）：
 *
 *   .tsr-btn        — 36x36 圆角方块按钮
 *   .tsr-btn--active — 高亮（当前选中 tab）
 *   .tsr-sep        — 水平细线分隔符
 *   .tsr-badge      — 按钮右上角的任务数徽标
 *
 * 这样 BookDetailsTablet 的 "sidebar toggle + 分隔 + AI + 进度" 与 BooksPage
 * 的 "list toggle + 分隔 + AI + 进度" 不需要各维护一份样式。
 */
</script>

<template>
  <aside class="tsr-rail" aria-label="辅助工具">
    <slot />
  </aside>
</template>

<style scoped>
.tsr-rail {
  flex-shrink: 0;
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 6px;
  background: rgba(10, 12, 15, 0.55);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

:slotted(.tsr-btn) {
  position: relative;
  width: 36px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(247, 244, 236, 0.72);
  cursor: pointer;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

:slotted(.tsr-btn:hover) {
  background: rgba(255, 255, 255, 0.05);
  color: #e9edf5;
}

:slotted(.tsr-btn--active) {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.32);
  color: #a3b7cf;
}

:slotted(.tsr-btn i) {
  font-size: 14px;
  line-height: 1;
}

:slotted(.tsr-sep) {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

:slotted(.tsr-badge) {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #d97757;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1;
  border: 1.5px solid #080a0d;
}
</style>
