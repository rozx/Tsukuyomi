<script setup lang="ts">
/**
 * 桌面任务中心：
 * - 未固定：点击 chip 打开 PrimeVue Popover，点外部关闭
 * - 固定：悬浮面板，点外部不关闭，可拖动标题区移动（位置限制在视口内并持久化），
 *   可收起成迷你进度条；导航与断点切换后保持（挂在 MainLayout dispatcher 上）
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Popover from 'primevue/popover';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import TaskCenterBody from './TaskCenterBody.vue';
import TaskCenterMiniBar from './TaskCenterMiniBar.vue';

const center = injectTaskCenter();
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const PANEL_WIDTH = 400;
const MARGIN = 8;

const defaultPosition = () => ({
  x: Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - 16),
  y: 56,
});

/** 把位置限制在视口内 */
const clamp = (pos: { x: number; y: number }) => {
  const rect = panelRef.value?.getBoundingClientRect();
  const width = rect?.width ?? PANEL_WIDTH;
  const height = rect?.height ?? 48;
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
    y: Math.min(Math.max(MARGIN, pos.y), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
  };
};

const livePosition = ref<{ x: number; y: number } | null>(null);
const panelStyle = computed(() => {
  const pos = livePosition.value ?? center.position.value ?? defaultPosition();
  return { left: `${pos.x}px`, top: `${pos.y}px`, width: `${PANEL_WIDTH}px` };
});

let dragOffset: { dx: number; dy: number; startX: number; startY: number } | null = null;
/** 本次按下后是否真的拖动过；拖动结束时紧接着的 click 不算展开 */
let dragged = false;
const DRAG_THRESHOLD = 4;
const onDragMove = (event: PointerEvent) => {
  if (!dragOffset) return;
  if (
    !dragged &&
    Math.hypot(event.clientX - dragOffset.startX, event.clientY - dragOffset.startY) <
      DRAG_THRESHOLD
  ) {
    return;
  }
  dragged = true;
  livePosition.value = clamp({ x: event.clientX - dragOffset.dx, y: event.clientY - dragOffset.dy });
};
const onDragEnd = () => {
  if (!dragOffset) return;
  dragOffset = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  if (livePosition.value) center.setPosition(livePosition.value);
  livePosition.value = null;
};
const onDragStart = (event: PointerEvent) => {
  if (event.button !== 0) return;
  const rect = panelRef.value?.getBoundingClientRect();
  if (!rect) return;
  dragged = false;
  dragOffset = {
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top,
    startX: event.clientX,
    startY: event.clientY,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
};

const onResize = () => {
  if (center.position.value) center.setPosition(clamp(center.position.value));
};

const expandFromMini = () => {
  if (dragged) {
    dragged = false;
    return;
  }
  center.setCollapsed(false);
};

const pin = () => {
  popoverRef.value?.hide();
  center.setPinned(true);
};
const unpin = () => center.setPinned(false);

onMounted(() => {
  window.addEventListener('resize', onResize);
  center.registerOpener((event) => {
    if (center.pinned.value) {
      center.setCollapsed(!center.collapsed.value);
      return;
    }
    if (event) popoverRef.value?.toggle(event);
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  onDragEnd();
  center.registerOpener(null);
});
</script>

<template>
  <Popover
    ref="popoverRef"
    class="tc-popover"
    :dismissable="true"
    @show="center.setOpen(true)"
    @hide="center.setOpen(false)"
  >
    <TaskCenterBody mode="popover" @pin="pin" />
  </Popover>

  <Teleport to="body">
    <div
      v-if="center.pinned.value"
      ref="panelRef"
      class="tc-pinned"
      :class="{ 'tc-pinned--collapsed': center.collapsed.value }"
      :style="panelStyle"
      role="dialog"
      data-testid="task-center-pinned"
    >
      <TaskCenterMiniBar
        v-if="center.collapsed.value"
        @expand="expandFromMini"
        @drag-start="onDragStart"
      />
      <TaskCenterBody
        v-else
        mode="pinned"
        @unpin="unpin"
        @collapse="center.setCollapsed(true)"
        @drag-start="onDragStart"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.tc-pinned {
  position: fixed;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  border: 1px solid rgba(163, 183, 207, 0.35);
  background: var(--shell-opacity-96);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.tc-pinned--collapsed {
  width: 280px !important;
}
</style>

<style>
.tc-popover.p-popover {
  width: min(420px, 94vw);
  padding: 0;
}

.tc-popover .p-popover-content {
  padding: 0;
}
</style>
