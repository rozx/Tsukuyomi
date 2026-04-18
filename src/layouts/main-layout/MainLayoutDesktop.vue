<script setup lang="ts">
import AppHeader from 'src/components/layout/AppHeader.vue';
import AppFooter from 'src/components/layout/AppFooter.vue';
import AppSideMenu from 'src/components/layout/AppSideMenu.vue';
import AppRightPanel from 'src/components/layout/AppRightPanel.vue';
import { RouterView } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="h-screen overflow-hidden bg-tsukuyomi-sky text-moon-100 flex flex-col">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden min-h-0 relative max-w-full">
      <div
        class="sidebar-wrapper flex-shrink-0 flex flex-col"
        :style="{ width: ui.sideMenuOpen ? '16rem' : '0' }"
        :inert="!ui.sideMenuOpen"
      >
        <div
          class="h-full w-64 transform transition duration-200 flex flex-col"
          :class="ui.sideMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'"
        >
          <AppSideMenu />
        </div>
      </div>

      <!--
        性能关键（已知根因）：此前这里有 `backdrop-blur-xl`（24px 高斯模糊）叠加在
        bg-night-900/60 半透明背景上。<main> 是整个应用的滚动容器，因此每次滚动帧
        浏览器都要：重新捕获 tsukuyomi-sky 背景 → 做 24px 高斯模糊 → 合成。
        全屏尺寸下 GPU 负担巨大，导致 BooksPage / BookDetailsPage 等所有页面滚动卡顿。
        移除 backdrop-blur 后，仍然通过 bg-night-900/60 显示半透明夜空底色，只是不带模糊，
        视觉上略微清晰，但滚动流畅。如果需要恢复"毛玻璃"观感，可考虑把模糊放到固定定位
        的伪元素上（不随滚动重绘），而不是作用在滚动容器本身。
      -->
      <main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-night-900/60">
        <RouterView />
      </main>

      <div
        class="right-panel-wrapper flex-shrink-0 flex flex-col"
        :style="{ width: ui.rightPanelOpen ? `${ui.rightPanelWidth}px` : '0' }"
        :inert="!ui.rightPanelOpen"
      >
        <div
          class="h-full transform transition duration-200 flex flex-col"
          :style="{ width: `${ui.rightPanelWidth}px` }"
          :class="ui.rightPanelOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'"
        >
          <AppRightPanel />
        </div>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.sidebar-wrapper,
.right-panel-wrapper {
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
  height: 100%;
}

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  height: 100%;
}
</style>
