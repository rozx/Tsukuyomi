<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import AppHeader from '../components/layout/AppHeader.vue';
import AppFooter from '../components/layout/AppFooter.vue';
import AppSideMenu from '../components/layout/AppSideMenu.vue';
import Toast from 'primevue/toast';
import { RouterView } from 'vue-router';
import { useUiStore } from '../stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import { useAutoSync } from 'src/composables/useAutoSync';
import ConflictResolutionDialog from 'src/components/dialogs/ConflictResolutionDialog.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const ui = useUiStore();
const { markAsReadByMessage } = useToastHistory();
const toast = useToastWithHistory();

// 处理 Toast 关闭事件
const handleToastClose = (event: any) => {
  if (event?.message) {
    void markAsReadByMessage(event.message);
  }
};

// 自动同步
const {
  showConflictDialog,
  detectedConflicts,
  handleConflictResolve,
  handleConflictCancel,
  setupAutoSync,
  stopAutoSync,
} = useAutoSync();

// 处理冲突解决（带错误处理）
const handleConflictResolveWithError = async (resolutions: any[]) => {
  try {
    await handleConflictResolve(resolutions);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '同步失败',
      detail: error instanceof Error ? error.message : '解决冲突时发生未知错误',
      life: 5000,
    });
  }
};

onMounted(() => {
  setupAutoSync();

});

onUnmounted(() => {
  stopAutoSync();
});
</script>

<template>
  <div class="h-screen overflow-hidden bg-luna-sky text-moon-100 flex flex-col">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden min-h-0">
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
      <main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-night-900/80 backdrop-blur-xl">
        <RouterView />
      </main>
    </div>

    <AppFooter />
  </div>

  <!-- Toast 组件 -->
  <Toast position="top-right" @close="handleToastClose" />

  <!-- 冲突解决对话框 -->
  <ConflictResolutionDialog
    :visible="showConflictDialog"
    :conflicts="detectedConflicts"
    @resolve="handleConflictResolveWithError"
    @cancel="handleConflictCancel"
  />
</template>

<style scoped>
.sidebar-wrapper {
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
  height: 100%;
}

main {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* Required for flexbox overflow to work */
  height: 100%; /* Ensure main takes full height of flex container */
}
</style>
