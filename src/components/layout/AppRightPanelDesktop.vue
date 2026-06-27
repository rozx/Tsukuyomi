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
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { usePanelResize } from 'src/composables/chat/usePanelResize';
import AppChatPanelDesktop from './AppChatPanelDesktop.vue';
import AppProgressPanelDesktop from './AppProgressPanelDesktop.vue';
import RightPanelRail from './RightPanelRail.vue';

const props = withDefaults(
  defineProps<{ showResizeHandle?: boolean; collapsed?: boolean }>(),
  { showResizeHandle: true, collapsed: false },
);

const ui = useUiStore();
const aiProcessing = useAIProcessingStore();
const route = useRoute();

const activeRightTab = computed(() => ui.activeRightTab);
const activeTranslationTaskCount = computed(() => aiProcessing.activeTranslationTaskCount);
const showBatchEmbeddings = computed(() => Boolean(route.params.id));

const { panelContainerRef, resizeHandleRef, isResizing, handleResizeStart } = usePanelResize();

// ParagraphCard 的 "复制到助手 / 解释选中" 通过 ui.assistantInputMessage 下发。
// AppChatPanelDesktop 仅在 activeRightTab === 'chat' 且面板展开时挂载，它内部的
// useRightPanel watcher 拿不到刚才的消息。这里在一直挂载的 dispatcher 上拦一层：
// 只负责切换到 chat tab + 打开面板，消息的填充与清理留给 useRightPanel 自己完成
// （watcher 已配置 immediate，面板挂起后会立即接管当前值）。
watch(
  () => ui.assistantInputMessage,
  (message) => {
    if (message == null) return;
    if (ui.activeRightTab !== 'chat') ui.setActiveRightTab('chat');
    if (!ui.rightPanelOpen) ui.openRightPanel();
  },
);

const expandToTab = (tab: 'chat' | 'progress') => {
  ui.setActiveRightTab(tab);
  if (!ui.rightPanelOpen) ui.openRightPanel();
};

defineExpose({ props });
</script>

<template>
  <RightPanelRail
    v-if="collapsed"
    :active-right-tab="activeRightTab"
    :right-panel-open="ui.rightPanelOpen"
    :active-translation-task-count="activeTranslationTaskCount"
    :show-batch-embeddings="showBatchEmbeddings"
    @expand="expandToTab"
  />

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
</style>
