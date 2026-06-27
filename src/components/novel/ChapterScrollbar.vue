<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import type { ScrollbarMetrics } from 'src/composables/book-details/useChapterVirtualizer';

/**
 * 自定义滚动条（桌面/平板/移动通用）。
 * 静止时滑块位置/大小由 model（基于原生滚动位置/范围）决定；
 * **拖动时滑块直接贴合光标**（不读 model），故即使 scrollHeight 因动态测量抖动，滑块也始终跟随鼠标、不漂移；
 * 同时把光标位置映射为 0..1 比例驱动 scrollToFraction（线性映射原生滚动范围，拖到底即可露出段落后的上下章按钮）。
 * 通过 Teleport 挂到非滚动的定位祖先（避免随内容滚走）。轨道 pointer-events:none，仅滑块可交互。
 */
const props = defineProps<{
  model: ScrollbarMetrics;
  /** Teleport 目标选择器（非滚动的 position: relative 祖先） */
  teleportTo: string;
  /** 按比例（0..1）滚动到原生滚动范围内的位置 */
  scrollToFraction: (fraction: number) => void;
}>();

const trackRef = ref<HTMLElement | null>(null);
const ready = ref(false);

// 滑块最小像素高度，必须与下方 CSS `.cc-scrollbar-thumb { min-height }` 保持一致：
// 拖拽计算需用「实际渲染高度」（百分比与 min-height 取大），否则短轨道（< MIN_THUMB_PX/heightPct）
// 下 range 偏小，拖到底时 thumb 越出轨道、视觉位置与滚动比例对不上。
const MIN_THUMB_PX = 28;

// 拖动态：滑块用 dragTopPct 贴合光标，覆盖静止的 model.topPct
const dragging = ref(false);
const dragTopPct = ref(0);
let grabOffset = 0;

const onMove = (e: PointerEvent) => {
  const track = trackRef.value;
  if (!dragging.value || !track) return;
  const trackRect = track.getBoundingClientRect();
  const thumbH = Math.max((props.model.heightPct / 100) * trackRect.height, MIN_THUMB_PX);
  const range = Math.max(1, trackRect.height - thumbH);
  const topPx = Math.min(range, Math.max(0, e.clientY - trackRect.top - grabOffset));
  // 滑块视觉位置直接跟随光标（与内容滚动解耦，避免抖动/滞后）
  dragTopPct.value = (topPx / trackRect.height) * 100;
  // 内容按比例滚动（线性映射原生范围）
  props.scrollToFraction(topPx / range);
};

const onUp = () => {
  dragging.value = false;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
};

const onThumbPointerDown = (e: PointerEvent) => {
  const thumb = e.currentTarget as HTMLElement;
  grabOffset = e.clientY - thumb.getBoundingClientRect().top;
  dragTopPct.value = props.model.topPct;
  dragging.value = true;
  thumb.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  e.preventDefault();
  e.stopPropagation();
};

// Teleport 目标可能晚一两帧才挂载：重试若干帧，避免单次检查落空导致滚动条永不渲染。
let readyRaf = 0;
const waitForTarget = (attempt: number) => {
  if (document.querySelector(props.teleportTo)) {
    ready.value = true;
    return;
  }
  if (attempt < 10 && typeof requestAnimationFrame === 'function') {
    readyRaf = requestAnimationFrame(() => waitForTarget(attempt + 1));
  }
};

onMounted(() => {
  void nextTick(() => waitForTarget(0));
});

onBeforeUnmount(() => {
  if (readyRaf) cancelAnimationFrame(readyRaf);
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
});
</script>

<template>
  <Teleport v-if="ready" :to="teleportTo">
    <div v-if="model.draggable" ref="trackRef" class="cc-scrollbar" aria-hidden="true">
      <div
        class="cc-scrollbar-thumb"
        :class="{ 'cc-scrollbar-thumb--dragging': dragging }"
        :style="{ top: `${dragging ? dragTopPct : model.topPct}%`, height: `${model.heightPct}%` }"
        @pointerdown="onThumbPointerDown"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* 轨道：仅视觉，pointer-events:none 让内容滚动/触摸穿透；只有滑块可交互 */
.cc-scrollbar {
  position: absolute;
  top: 0;
  right: 2px;
  bottom: 0;
  width: 12px;
  z-index: 30;
  pointer-events: none;
  opacity: 0.55;
  transition: opacity 0.2s ease;
}

.cc-scrollbar:hover {
  opacity: 1;
}

.cc-scrollbar-thumb {
  position: absolute;
  right: 0;
  width: 8px;
  /* 必须与 JS 的 MIN_THUMB_PX 保持一致（拖拽计算依赖实际渲染高度） */
  min-height: 28px;
  border-radius: 4px;
  background: var(--moon-opacity-40);
  cursor: grab;
  pointer-events: auto;
  /* 扩大触摸命中区域而不改变视觉宽度 */
  touch-action: none;
  transition:
    width 0.15s ease,
    background 0.15s ease;
}

.cc-scrollbar:hover .cc-scrollbar-thumb {
  width: 10px;
  background: var(--moon-opacity-60);
}

.cc-scrollbar-thumb:active,
.cc-scrollbar-thumb--dragging {
  cursor: grabbing;
  background: var(--primary-opacity-70);
}

/* 拖动中保持醒目（即使光标移出轨道悬停区），且 top 不做过渡以紧贴光标 */
.cc-scrollbar-thumb--dragging {
  width: 10px;
  transition: none;
}
</style>
