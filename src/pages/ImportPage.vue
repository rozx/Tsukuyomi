<script setup lang="ts">
/**
 * /import/:taskId? 的 dispatcher。业务状态由 provideImportPage() 提供，
 * 一次性初始化（订阅、回收中断运行、路由同步）只在这里执行一次；
 * 设备变体经 useDeviceVariant 选择，断点切换不会重复初始化或启动 Agent。
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideImportPage } from 'src/composables/import-page/useImportPage';
import ImportPageDesktop from './import-page/ImportPageDesktop.vue';
import ImportPageTablet from './import-page/ImportPageTablet.vue';
import ImportPageMobile from './import-page/ImportPageMobile.vue';

provideImportPage();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return ImportPageMobile;
    case 'tablet':
      return ImportPageTablet;
    case 'desktop':
    default:
      return ImportPageDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
