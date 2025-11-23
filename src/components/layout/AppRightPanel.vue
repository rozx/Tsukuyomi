<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import { useUiStore } from 'src/stores/ui';

const ui = useUiStore();
const panelContainerRef = ref<HTMLElement | null>(null);
</script>

<template>
  <aside
    ref="panelContainerRef"
    class="w-64 shrink-0 h-full border-l border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative"
  >
    <!-- Subtle gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-b from-luna-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- Header with close button -->
    <div class="shrink-0 px-4 pt-6 pb-4 relative z-10 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-moon-100 uppercase tracking-wide">右侧面板</h2>
      <Button
        aria-label="关闭面板"
        class="p-button-text p-button-rounded text-moon-70 hover:text-moon-100 transition-colors"
        icon="pi pi-times"
        @click="ui.closeRightPanel()"
      />
    </div>

    <!-- Main content area -->
    <div class="flex-1 overflow-auto px-4 pt-2 pb-4 min-h-0 min-w-0 max-w-full relative z-10">
      <div class="text-sm text-moon-60">
        <!-- 这里可以添加面板内容 -->
        <p class="text-center py-8 text-moon-40">面板内容区域</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* 可以添加自定义样式 */
</style>

