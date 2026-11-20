<script setup lang="ts">
/**
 * 任务中心 dispatcher：按设备变体渲染弹出层 / 固定面板（桌面、平板）或底部抽屉（手机）。
 * 由 MainLayout dispatcher 挂载一次，断点切换不会重复挂载共享状态（provideTaskCenter 在上层）。
 */
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import TaskCenterDesktop from './TaskCenterDesktop.vue';
import TaskCenterTablet from './TaskCenterTablet.vue';
import TaskCenterMobile from './TaskCenterMobile.vue';

const { variant } = useDeviceVariant();
</script>

<template>
  <TaskCenterMobile v-if="variant === 'mobile'" />
  <TaskCenterTablet v-else-if="variant === 'tablet'" />
  <TaskCenterDesktop v-else />
</template>
