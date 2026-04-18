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
import { onBeforeUnmount, watch } from 'vue';

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
    /** 是否允许点击遮罩关闭；默认 true。`closable=false` 时强制无效。 */
    dismissOnMaskClick?: boolean;
    /**
     * 是否允许用户主动关闭。false 时：
     *   - 隐藏 grabber 与 X 关闭按钮
     *   - 禁用遮罩点击关闭（无论 dismissOnMaskClick 取值）
     * 用于关键流程（AskUserDialog）或保存中状态（MemoryPanel `:closable=!isSaving`）。
     */
    closable?: boolean;
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
    closable: true,
    fullBleed: false,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const close = () => {
  if (!props.closable) return;
  emit('update:visible', false);
};

const onBackdropClick = () => {
  // 关闭拦截优先级：不可关闭 > 背景点击禁用
  if (!props.closable || !props.dismissOnMaskClick) return;
  emit('update:visible', false);
};

/**
 * Body scroll-lock 采用模块级引用计数 + 原值捕获：
 *   - 多个 sheet / dialog 同时打开时不会相互解锁（关闭一个时其它仍需保持锁定）
 *   - 锁定前捕获原 overflow，全部解锁时精确还原（包括用户在 body 上自设的值）
 *   - 若 sheet 在可见状态下卸载，onBeforeUnmount 也会释放锁定
 */
let lockedByThisInstance = false;
watch(
  () => props.visible,
  (open) => {
    if (typeof document === 'undefined') return;
    if (open && !lockedByThisInstance) {
      acquireBodyScrollLock();
      lockedByThisInstance = true;
    } else if (!open && lockedByThisInstance) {
      releaseBodyScrollLock();
      lockedByThisInstance = false;
    }
  },
);

onBeforeUnmount(() => {
  if (lockedByThisInstance) {
    releaseBodyScrollLock();
    lockedByThisInstance = false;
  }
});
</script>

<script lang="ts">
// 模块级：多个 overlay 可以同时要求锁定，只有最后一个释放时才真正解锁
let bodyScrollLockCount = 0;
let previousBodyOverflow: string | null = null;

function acquireBodyScrollLock() {
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
}

function releaseBodyScrollLock() {
  if (bodyScrollLockCount === 0) {
    // 计数器失衡通常意味着上游有未成对的 release 调用（例如异常路径忘了触发 acquire）。
    // 生产环境静默兜底；开发环境打印告警，方便及时发现。
    if (import.meta.env?.DEV) {
      console.warn('[MobileBottomSheet] releaseBodyScrollLock called with empty lock counter');
    }
    return;
  }
  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount === 0) {
    // 还原至锁定前的原值（可能是空串——等价于移除内联样式）
    if (previousBodyOverflow) {
      document.body.style.overflow = previousBodyOverflow;
    } else {
      document.body.style.removeProperty('overflow');
    }
    previousBodyOverflow = null;
  }
}
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
               轻拍/下滑可关闭，视觉上提示这是一个可拖动的底部抽屉。
               `closable=false` 时完全隐藏——关键流程不允许用户快速关闭 -->
          <button
            v-if="closable"
            type="button"
            class="mbs-grabber"
            :aria-label="closeLabel"
            @click="close"
          >
            <div class="mbs-grabber-bar" />
          </button>
          <!-- 不可关闭时留出 grabber 的视觉占位，避免 head 太贴顶 -->
          <div v-else class="mbs-grabber-spacer" aria-hidden="true" />
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
                v-if="closable"
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
          <div v-if="$slots.footer" class="mbs-footer">
            <slot name="footer" :close="close" />
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

/* 不可关闭时的 grabber 占位，保持与可关闭状态相近的顶部节奏 */
.mbs-grabber-spacer {
  flex-shrink: 0;
  height: 12px;
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
  /*
   * Root cause of sheet-content overflow: the sheet is narrow (often ≤375px),
   * and desktop-first content (URL chips, long tokens) has a min-content that
   * exceeds that width. In a flex-column with align-items:stretch, a child's
   * used cross-axis size is max(min-content, container) — so a single 400px
   * min-content token stretches the whole column past the sheet, and the
   * entire layout follows. `overflow-wrap: anywhere` tells the browser that
   * min-content for text is 0 (break anywhere is allowed), which lets flex
   * stretch actually resolve to the sheet width instead of the widest token.
   */
  overflow-wrap: anywhere;
}

/* 全出血模式：消除 body 内边距并不再滚动（由内部子组件自己管理滚动区） */
.mbs-body--full-bleed {
  padding: 0;
  overflow: hidden;
}

/* sheet 底部固定操作区 —— 放置主要按钮行，独立于可滚动 body */
.mbs-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 14px);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(14, 17, 22, 0.98);
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
