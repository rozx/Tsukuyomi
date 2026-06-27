<script setup lang="ts">
/**
 * 平板右侧竖向图标导航条——BookDetailsTablet / BooksPageTablet 共用。
 *
 * 只负责外壳（48px 宽 + 深色半透明背景 + 左边细线），按钮由调用方通过默认
 * slot 传入。按钮使用以下约定类名：
 *
 *   .tsr-btn        — 36x36 圆角方块按钮；基础盒模型样式由调用方叠加的
 *                     .rail-base-btn 提供（与 RightPanelRail 共用 rail-base.css），
 *                     hover / active 态由本组件的 :slotted() 接管
 *   .tsr-btn--active — 高亮（当前选中 tab）
 *   .tsr-sep        — 水平细线分隔符（:slotted()）
 *
 * 按钮右上角的任务数徽标统一用 NotificationBadge 组件（绝对定位，依赖
 * .tsr-btn 的 relative 上下文，该 relative 来自 .rail-base-btn）。
 *
 * 这样 BookDetailsTablet 的 "sidebar toggle + 分隔 + AI + 进度" 与 BooksPage
 * 的 "list toggle + 分隔 + AI + 进度" 不需要各维护一份样式。
 */
</script>

<template>
  <aside class="tsr-rail rail-base-shell" aria-label="辅助工具">
    <slot />
  </aside>
</template>

<style scoped>
/* 外壳 / 图标按钮的共享声明见 rail-base.css（与 RightPanelRail 共用） */
@import './rail-base.css';

/* 平板侧轨：固定 48px 宽，外壳基础样式来自 .rail-base-shell */
.tsr-rail {
  width: 48px;
}

/*
 * 按钮基础盒模型由调用方按钮叠加的 .rail-base-btn 提供（slot 内容，本组件
 * 无法直接命中）。这里只保留 hover / active / 图标 / 分隔符的差异化样式。
 *
 * hover / active 选择器特意叠上 .rail-base-btn，把特异性抬到高于基础规则，
 * 确保无论两份样式表注入顺序如何，高亮态都稳定覆盖基础态（行为不变）。
 */
:slotted(.rail-base-btn.tsr-btn:hover) {
  background: rgba(255, 255, 255, 0.05);
  color: #e9edf5;
}

:slotted(.rail-base-btn.tsr-btn--active) {
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
</style>
