<script setup lang="ts">
/**
 * 桌面任务中心：
 * - 未固定：点击 chip 打开 PrimeVue Popover，点外部关闭（关闭时回到列表）
 * - 固定：悬浮面板，点外部不关闭；拖动标题区移动、拖动右边 / 下边 / 右下角缩放，
 *   位置与尺寸限制在视口内并持久化；可收起成迷你进度条；导航与断点切换后保持（挂在 MainLayout dispatcher 上）
 */
import { useAnchoredPopover } from 'src/composables/useAnchoredPopover';
import { usePointerDrag } from 'src/composables/usePointerDrag';
import {
  clampPanelPosition,
  clampPanelSize,
  defaultPanelPosition,
  defaultPanelSize,
  displayPanelBox,
  PINNED_MINI_SIZE,
} from 'src/composables/task-center/pinned-panel-geometry';
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import Popover from 'primevue/popover';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import TaskCenterBody from './TaskCenterBody.vue';
import TaskCenterMiniBar from './TaskCenterMiniBar.vue';

const { t } = useI18n();
const center = injectTaskCenter();
const popoverRef = ref<InstanceType<typeof Popover> | null>(null);

const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight });
/** 视口尺寸（响应式）：面板显示时按它适配，保存的位置与尺寸不随窗口变化而改写 */
const viewportSize = ref(readViewport());
const viewport = () => viewportSize.value;
const onWindowResize = () => {
  viewportSize.value = readViewport();
};

/** 拖动 / 缩放过程中的实时位置与尺寸；松开时才写入 store（避免每帧写 localStorage） */
const livePosition = ref<{ x: number; y: number } | null>(null);
const liveSize = ref<{ width: number; height: number } | null>(null);

/** 实际显示的位置与尺寸：保存值（或默认值）适配当前视口 */
const shownBox = computed(() => {
  const size = liveSize.value ?? center.size.value ?? defaultPanelSize(viewport());
  const pos = livePosition.value ?? center.position.value ?? defaultPanelPosition(size, viewport());
  return displayPanelBox({ ...pos, ...size }, viewport(), center.collapsed.value);
});
const currentPosition = () => ({ x: shownBox.value.x, y: shownBox.value.y });
const currentSize = () => ({ width: shownBox.value.width, height: shownBox.value.height });

const panelStyle = computed(() => ({
  left: `${shownBox.value.x}px`,
  top: `${shownBox.value.y}px`,
  width: `${shownBox.value.width}px`,
  height: `${shownBox.value.height}px`,
}));

// ---------- 拖动标题区移动 ----------
let moveOrigin = { x: 0, y: 0 };
/** 本次按下后是否真的拖动过；拖动结束时紧接着的 click 不算展开迷你条 */
let dragged = false;
const moveDrag = usePointerDrag({
  onMove: ({ dx, dy }) => {
    livePosition.value = clampPanelPosition(
      { x: moveOrigin.x + dx, y: moveOrigin.y + dy },
      center.collapsed.value ? PINNED_MINI_SIZE : currentSize(),
      viewport(),
    );
  },
  onEnd: (moved) => {
    dragged = moved;
    if (livePosition.value) center.setPosition(livePosition.value);
    livePosition.value = null;
  },
});
const onDragStart = (event: PointerEvent) => {
  moveOrigin = currentPosition();
  moveDrag.begin(event);
};

// ---------- 拖动边缘缩放 ----------
type ResizeEdge = 'right' | 'bottom' | 'corner';
let resizeEdge: ResizeEdge = 'corner';
let resizeOrigin = { width: 0, height: 0 };
const resizeDrag = usePointerDrag({
  threshold: 1,
  onMove: ({ dx, dy }) => {
    liveSize.value = clampPanelSize(
      {
        width: resizeOrigin.width + (resizeEdge === 'bottom' ? 0 : dx),
        height: resizeOrigin.height + (resizeEdge === 'right' ? 0 : dy),
      },
      currentPosition(),
      viewport(),
    );
  },
  onEnd: () => {
    if (liveSize.value) center.setSize(liveSize.value);
    liveSize.value = null;
  },
});
const onResizeStart = (edge: ResizeEdge, event: PointerEvent) => {
  // 没有保存过位置时默认贴右侧，加宽会让左边移动；显示位置被视口推挤过时也以显示位置为准
  center.setPosition(currentPosition());
  resizeEdge = edge;
  resizeOrigin = currentSize();
  resizeDrag.begin(event);
};

const expandFromMini = () => {
  if (dragged) {
    dragged = false;
    return;
  }
  center.setCollapsed(false);
};

const pin = () => {
  center.setPinned(true);
  popoverRef.value?.hide();
};
const unpin = () => center.setPinned(false);

onMounted(() => {
  window.addEventListener('resize', onWindowResize);
  center.registerOpener((event, anchor) => {
    if (center.pinned.value) {
      center.setCollapsed(!center.collapsed.value);
      return;
    }
    // 其他入口（月詠桌宠）给出稳定的锚点，自己的按钮可能随即卸载
    const target = anchor ?? (event?.currentTarget instanceof Element ? event.currentTarget : null);
    if (!target) return;
    anchored.prepare(target);
    popoverRef.value?.toggle(event ?? new MouseEvent('click'), target);
  });
});

// 固定面板展开时告诉任务中心它在屏幕上（后台向量化区据此决定是否刷新本书统计）
watchEffect(() => center.setPinnedPanelShown(center.pinned.value && !center.collapsed.value));

onUnmounted(() => {
  center.setPinnedPanelShown(false);
  // 断点切换卸载本变体时弹出层随之消失，PrimeVue 不会再发出 hide：同步清掉打开标记
  center.setOpen(false);
  window.removeEventListener('resize', onWindowResize);
  moveDrag.cancel();
  resizeDrag.cancel();
  center.registerOpener(null);
});

// 弹层箭头对准 chip（PrimeVue 默认会偏到 chip 左侧）；详情视图用按钮下方能放下的高度
const anchored = useAnchoredPopover({ containerClass: 'tc-popover', max: 600 });
const onPopoverShow = () => {
  center.setOpen(true);
  anchored.centerArrow();
};
/** popover 是概览入口：关闭后再次打开回到列表（固定面板保留当前详情） */
const onPopoverHide = () => {
  center.setOpen(false);
  if (!center.pinned.value) center.closeDetail();
};
</script>

<template>
  <Popover
    ref="popoverRef"
    class="anchored-popover header-popover tc-popover"
    :dismissable="true"
    @show="onPopoverShow"
    @hide="onPopoverHide"
  >
    <TaskCenterBody mode="popover" :detail-height="anchored.height.value" @pin="pin" />
  </Popover>

  <Teleport to="body">
    <div
      v-if="center.pinned.value"
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
      <template v-else>
        <TaskCenterBody
          mode="pinned"
          @unpin="unpin"
          @collapse="center.setCollapsed(true)"
          @drag-start="onDragStart"
        />
        <!-- 缩放手柄：右边、下边、右下角 -->
        <div
          class="tc-resize tc-resize--right"
          aria-hidden="true"
          @pointerdown.prevent="onResizeStart('right', $event)"
        />
        <div
          class="tc-resize tc-resize--bottom"
          aria-hidden="true"
          @pointerdown.prevent="onResizeStart('bottom', $event)"
        />
        <div
          class="tc-resize tc-resize--corner"
          :title="t('taskQueueUi.resize')"
          aria-hidden="true"
          @pointerdown.prevent="onResizeStart('corner', $event)"
        />
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.tc-pinned {
  position: fixed;
  /* 低于 PrimeVue 弹层（Popover / 菜单从 1000 起）：固定在右上角时，
     同步、消息等顶部弹层与输入下拉仍显示在面板之上 */
  z-index: 990;
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

/* 收起成迷你条：宽度固定、高度随内容 */
.tc-pinned--collapsed {
  width: 280px !important;
  height: auto !important;
}

.tc-resize {
  position: absolute;
  z-index: 3;
  touch-action: none;
}

.tc-resize--right {
  top: 12px;
  right: 0;
  bottom: 12px;
  /* 窄一些：不挡住列表滚动条 */
  width: 4px;
  cursor: ew-resize;
}

.tc-resize--bottom {
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 4px;
  cursor: ns-resize;
}

/* 右下角：可见的斜线手柄 */
.tc-resize--corner {
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg,
    transparent 0 55%,
    var(--moon-opacity-40) 55% 61%,
    transparent 61% 72%,
    var(--moon-opacity-40) 72% 78%,
    transparent 78%
  );
  opacity: 0.7;
}

.tc-resize--corner:hover {
  opacity: 1;
}
</style>
