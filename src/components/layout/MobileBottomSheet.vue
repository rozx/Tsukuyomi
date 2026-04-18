<script setup lang="ts">
/**
 * 可复用的手机端底部抽屉（bottom sheet）。
 *
 * 设计稿基于 Tsukuyomi Mobile 的 sheet 形态：
 *   渐变遮罩 → 圆角顶部 → 居中 title + eyebrow → 可滚动 body → 安全区内边距
 *
 * 使用方式：
 *   <MobileBottomSheet v-model:visible="isOpen" title="AI 思考过程" eyebrow="TASKS">
 *     <TheContent />
 *   </MobileBottomSheet>
 *
 * 目的：所有 mobile 端的 popover / drawer 都走同一套 sheet 壳，避免每个消费者
 * 各自重复编写 backdrop / sheet 容器 / 动画。
 */
import { watch } from 'vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    /** 标题上方的 eyebrow 文案；默认留空 */
    eyebrow?: string;
    /** 关闭按钮的 aria-label；默认"关闭" */
    closeLabel?: string;
    /** sheet 的最大高度，默认 92dvh —— 几乎占满屏，只露一点上方页面作为回退感知 */
    maxHeight?: string;
    /**
     * sheet 的最小高度；默认 80dvh，保证即使内容很少，sheet 也占据大半屏，
     * 避免只显示几行的"贴片"观感。
     */
    minHeight?: string;
    /** 是否允许点击遮罩关闭；默认 true */
    dismissOnMaskClick?: boolean;
    /**
     * 让 body 全出血（无 padding），适合自带 app bar / composer 的面板（chat、progress）
     * 占满整个 sheet body 区域，不浪费边距。默认 false（保留 12px×16px padding）。
     */
    fullBleed?: boolean;
  }>(),
  {
    eyebrow: '',
    closeLabel: '关闭',
    maxHeight: '92dvh',
    minHeight: '80dvh',
    dismissOnMaskClick: true,
    fullBleed: false,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const close = () => emit('update:visible', false);

const onBackdropClick = () => {
  if (props.dismissOnMaskClick) close();
};

// 打开时锁定 body 滚动，避免页面背景跟随手势滚动
watch(
  () => props.visible,
  (open) => {
    if (typeof document === 'undefined') return;
    if (open) {
      document.body.style.setProperty('overflow', 'hidden');
    } else {
      document.body.style.removeProperty('overflow');
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="mbs">
      <div
        v-if="visible"
        class="mbs-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="onBackdropClick"
      >
        <div class="mbs-sheet" :style="{ maxHeight, minHeight }">
          <!-- Grabber 手柄（按月詠 mobile 设计稿 ChatSheetVariant）：
               轻拍/下滑可关闭，视觉上提示这是一个可拖动的底部抽屉 -->
          <button
            type="button"
            class="mbs-grabber"
            :aria-label="closeLabel"
            @click="close"
          >
            <div class="mbs-grabber-bar" />
          </button>
          <!-- 消费者可通过 #header slot 自定义整个 header 行（如 chat 需要
               logo + 标题 + 副标题 + 动作按钮 单行紧凑布局），不提供时使用
               默认的 eyebrow + title + close 布局 -->
          <slot name="header" :close="close">
            <header class="mbs-head">
              <div class="mbs-head-text">
                <div v-if="eyebrow" class="mbs-eyebrow">{{ eyebrow }}</div>
                <div class="mbs-title">{{ title }}</div>
              </div>
              <button
                type="button"
                class="mbs-close"
                :aria-label="closeLabel"
                @click="close"
              >
                <i class="pi pi-times" aria-hidden="true" />
              </button>
            </header>
          </slot>
          <div class="mbs-body" :class="{ 'mbs-body--full-bleed': fullBleed }">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mbs-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 13, 0.72);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.mbs-sheet {
  width: 100%;
  max-width: 520px;
  background: rgba(14, 17, 22, 0.98);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

/* Grabber 手柄 */
.mbs-grabber {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px 0 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.mbs-grabber-bar {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbs-grabber:active .mbs-grabber-bar {
  background: rgba(255, 255, 255, 0.45);
}

.mbs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.mbs-head-text {
  min-width: 0;
  flex: 1;
}

.mbs-eyebrow {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(163, 183, 207, 0.85);
  margin-bottom: 4px;
}

.mbs-title {
  font-size: 18px;
  font-weight: 600;
  color: #e9edf5;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mbs-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(192, 198, 209, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbs-close i {
  font-size: 12px;
}

.mbs-close:active {
  background: rgba(255, 255, 255, 0.08);
  color: #e9edf5;
}

.mbs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
  color: rgba(247, 244, 236, 0.88);
  display: flex;
  flex-direction: column;
}

/* 全出血模式：消除 body 内边距并不再滚动（由内部子组件自己管理滚动区） */
.mbs-body--full-bleed {
  padding: 0;
  overflow: hidden;
}

/* 进出动画 */
.mbs-enter-active,
.mbs-leave-active {
  transition: opacity 220ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mbs-enter-active .mbs-sheet,
.mbs-leave-active .mbs-sheet {
  transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
}

.mbs-enter-from,
.mbs-leave-to {
  opacity: 0;
}

.mbs-enter-from .mbs-sheet,
.mbs-leave-to .mbs-sheet {
  transform: translateY(100%);
}
</style>
