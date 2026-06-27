<script setup lang="ts">
/**
 * 系统栏 / 侧轨通用的右上角通知徽标。
 *
 * 把原先散落在 AppHeader / MobileSysBar / RightPanelRail / TabletSysBar /
 * TabletSideRail 五处、声明完全一致的 `.badge` 样式收敛到这里，消除重复。
 * 父级用绝对定位的 relative 容器（按钮）包裹本组件，本组件只负责自身呈现。
 *
 * 内容由默认 slot 传入（如未读数、任务数），样式 / 尺寸 / 颜色保持原值不变。
 */
</script>

<template>
  <span class="notification-badge">
    <slot />
  </span>
</template>

<style scoped>
.notification-badge {
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
