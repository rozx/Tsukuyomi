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
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { usePanelResize } from 'src/composables/chat/usePanelResize';
import BatchEmbeddingsPanel from 'src/components/novel/BatchEmbeddingsPanel.vue';
import AppChatPanelDesktop from './AppChatPanelDesktop.vue';
import AppProgressPanelDesktop from './AppProgressPanelDesktop.vue';

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

const batchEmbeddingsPanelRef = ref<{ toggle: () => void } | null>(null);
const toggleBatchEmbeddingsPanel = () => {
  batchEmbeddingsPanelRef.value?.toggle();
};

defineExpose({ props });
</script>

<template>
  <aside v-if="collapsed" class="rp-rail" aria-label="右侧面板">
    <button
      type="button"
      class="rp-rail-item"
      :class="{ active: activeRightTab === 'chat' && ui.rightPanelOpen }"
      aria-label="月詠 AI 助手"
      title="月詠"
      @click="expandToTab('chat')"
    >
      <i class="pi pi-comments" aria-hidden="true" />
    </button>
    <button
      type="button"
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

    <template v-if="showBatchEmbeddings">
      <div class="rp-rail-sep" />
      <button
        type="button"
        class="rp-rail-item"
        aria-label="向量索引"
        title="向量索引"
        @click="toggleBatchEmbeddingsPanel"
      >
        <i class="pi pi-bolt" aria-hidden="true" />
      </button>
    </template>

    <div class="rp-rail-spacer" />

    <!-- 仅在书籍详情路由下挂载：避免在无关页面上订阅 EmbeddingQueue/Service/Memory 事件并触发 DB 查询 -->
    <BatchEmbeddingsPanel v-if="showBatchEmbeddings" ref="batchEmbeddingsPanelRef" />
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

/* 折叠态：纯图标竖排 —— 对齐 TabletSideRail 的 48px 右侧图标栏 */
.rp-rail {
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 6px;
  background: rgba(10, 12, 15, 0.55);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.rp-rail-item {
  position: relative;
  width: 36px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(247, 244, 236, 0.72);
  cursor: pointer;
  padding: 0;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rp-rail-item i {
  font-size: 14px;
  line-height: 1;
}

.rp-rail-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e9edf5;
}

.rp-rail-item.active {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.32);
  color: #a3b7cf;
}

.rp-rail-sep {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
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
