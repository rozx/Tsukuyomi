<script setup lang="ts">
/**
 * 桌面右侧面板分派器。
 *
 * - 折叠态 (`collapsed`)：纯图标栏（AI 助手 + 翻译进度），与左侧 side-rail /
 *   TabletNavRail 同构。
 * - 展开态：按 `ui.activeRightTab` 挂载 `AppChatPanelDesktop` 或
 *   `AppProgressPanelDesktop`，每个面板在 appbar 内自带关闭按钮，关闭即折叠。
 *
 * 外壳仅负责：固定宽度、拖拽 resize 手柄，以及激活面板的切换。业务 /
 * 视图状态完全下沉到两个独立面板文件。
 */
import { computed } from 'vue';
import { useUiStore } from 'src/stores/ui';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { usePanelResize } from 'src/composables/chat/usePanelResize';
import AppChatPanelDesktop from './AppChatPanelDesktop.vue';
import AppProgressPanelDesktop from './AppProgressPanelDesktop.vue';

const props = withDefaults(
  defineProps<{ showResizeHandle?: boolean; collapsed?: boolean }>(),
  { showResizeHandle: true, collapsed: false },
);

const ui = useUiStore();
const aiProcessing = useAIProcessingStore();

const activeRightTab = computed(() => ui.activeRightTab);
const activeTranslationTaskCount = computed(() => aiProcessing.activeTranslationTaskCount);

const { panelContainerRef, resizeHandleRef, isResizing, handleResizeStart } = usePanelResize();

const expandToTab = (tab: 'chat' | 'progress') => {
  ui.setActiveRightTab(tab);
  if (!ui.rightPanelOpen) ui.openRightPanel();
};

defineExpose({ props });
</script>

<template>
  <aside v-if="collapsed" class="rp-rail" aria-label="右侧面板">
    <button
      class="rp-rail-item"
      :class="{ active: activeRightTab === 'chat' && ui.rightPanelOpen }"
      aria-label="AI 助手"
      title="AI 助手"
      @click="expandToTab('chat')"
    >
      <i class="pi pi-comments" aria-hidden="true" />
    </button>
    <button
      class="rp-rail-item"
      :class="{ active: activeRightTab === 'progress' && ui.rightPanelOpen }"
      aria-label="翻译进度"
      title="翻译进度"
      @click="expandToTab('progress')"
    >
      <i class="pi pi-list-check" aria-hidden="true" />
      <span v-if="activeTranslationTaskCount > 0" class="rp-rail-badge">
        {{ activeTranslationTaskCount > 99 ? '99+' : activeTranslationTaskCount }}
      </span>
    </button>
    <div class="rp-rail-spacer" />
  </aside>

  <aside
    v-else
    ref="panelContainerRef"
    class="rp-shell"
    :style="{ width: `${ui.rightPanelWidth}px` }"
  >
    <div
      v-if="showResizeHandle"
      ref="resizeHandleRef"
      class="rp-resize"
      :class="{ 'rp-resize--active': isResizing }"
      @mousedown="handleResizeStart"
    />

    <AppChatPanelDesktop v-if="activeRightTab === 'chat'" />
    <AppProgressPanelDesktop v-else />
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

/* 折叠态：纯图标竖排 —— 对齐左侧 side-rail / TabletNavRail */
.rp-rail {
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0 16px;
  gap: 6px;
  background: var(--black-opacity-20);
  border-left: 1px solid var(--white-opacity-4);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.rp-rail-item {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  color: rgba(174, 183, 198, 0.75);
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
}

.rp-rail-item i {
  font-size: 16px;
  line-height: 1;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    text-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-rail-item:hover {
  background: var(--white-opacity-4);
  color: rgba(247, 244, 236, 1);
}

.rp-rail-item.active {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.3);
  color: #a3b7cf;
}

.rp-rail-item.active i {
  text-shadow: 0 0 12px rgba(109, 136, 168, 0.55);
}

.rp-rail-badge {
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

.rp-rail-spacer {
  flex: 1;
}
</style>
