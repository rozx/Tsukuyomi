<script setup lang="ts">
/**
 * 桌面右侧助手面板：可拖宽的外壳 + 对话面板（导入路由下为 ImportChatPanel）。
 * 只在面板打开时由 MainLayoutDesktop 挂载；关闭后右侧不占宽度，入口在顶部系统条。
 */
import { useUiStore } from 'src/stores/ui';
import { usePanelResize } from 'src/composables/chat/usePanelResize';
import AppChatPanelDesktop from './AppChatPanelDesktop.vue';
import ImportChatPanel from 'src/components/import/ImportChatPanel.vue';
import { useImportRouteScope } from 'src/composables/import-page/useImportRouteScope';

const ui = useUiStore();

const { panelContainerRef, resizeHandleRef, isResizing, handleResizeStart } = usePanelResize();

// 导入路由的聊天绑定当前导入任务：挂导入外壳替代普通月詠，同一时间只有一个聊天控制器
const isImportRoute = useImportRouteScope();
</script>

<template>
  <aside ref="panelContainerRef" class="rp-shell" :style="{ width: `${ui.rightPanelWidth}px` }">
    <div
      ref="resizeHandleRef"
      class="rp-resize"
      :class="{ 'rp-resize--active': isResizing }"
      @mousedown="handleResizeStart"
    />

    <ImportChatPanel v-if="isImportRoute" />
    <AppChatPanelDesktop v-else />
  </aside>
</template>

<style scoped>
.rp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--shell-opacity-96); /* token: night-300 @ 96% */
  border-left: 1px solid var(--white-opacity-8);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  position: relative;
}

.rp-resize {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 30;
  background: var(--tsukuyomi-opacity-10);
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-resize:hover {
  background: var(--tsukuyomi-opacity-20);
}

.rp-resize--active {
  background: var(--tsukuyomi-opacity-35); /* token: tsukuyomi-500 @ 35% */
}
</style>
