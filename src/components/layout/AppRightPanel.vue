<script setup lang="ts">
/**
 * 桌面右侧助手面板入口，只有 MainLayoutDesktop 使用。
 *
 * 平板与手机的助手面板直接挂在各自的布局外壳里（TabletChatPanel / MobileChatSheet），
 * 这里固定渲染桌面模板，防止平板 / 手机误用时出错。
 */
import AppRightPanelDesktop from './AppRightPanelDesktop.vue';
</script>

<template>
  <AppRightPanelDesktop />
</template>
