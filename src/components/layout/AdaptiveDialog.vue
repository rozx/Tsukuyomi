<script setup lang="ts">
/**
 * 自适应对话框（统一壳）：
 *  - 桌面 / 平板：PrimeVue Dialog（通过 useAdaptiveDialog 管理尺寸）
 *  - 手机：MobileBottomSheet（从底部弹起，避免弹窗把整个页面挡住）
 *
 * 使用方式：
 *   <AdaptiveDialog
 *     v-model:visible="visible"
 *     header="添加书籍"
 *     desktop-width="900px"
 *     desktop-height="90vh"
 *     :closable="!loading"
 *   >
 *     <!-- body -->
 *     <template #footer>
 *       <!-- footer buttons -->
 *     </template>
 *   </AdaptiveDialog>
 *
 * 约定：
 *   - `header` 字符串 → 桌面作为 Dialog header，手机作为 sheet title
 *   - `eyebrow` 仅手机生效
 *   - `modal` / `closeOnEscape` / `contentClass` 桌面独有，原样透传给 PrimeVue Dialog
 *   - `closable=false` 桌面与手机均会屏蔽用户主动关闭路径（桌面隐藏 X 按钮；
 *     手机隐藏 grabber + X + 禁用遮罩点击）
 *   - `dismissableMask` 映射到手机的 `sheetDismissOnMaskClick`（若未显式设置）
 */
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import MobileBottomSheet from './MobileBottomSheet.vue';
import { useAdaptiveDialog } from 'src/composables/useAdaptiveDialog';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    header?: string;
    /** 手机 sheet 的 eyebrow 文案（小型全大写分类）；桌面忽略 */
    eyebrow?: string;
    /** 桌面宽度 —— 对 Dialog 生效 */
    desktopWidth?: string;
    /** 桌面可选高度 */
    desktopHeight?: string;
    /** 平板宽度；默认 92vw */
    tabletWidth?: string;
    /** 平板高度；默认 92vh */
    tabletHeight?: string;
    /** sheet 的最大高度，仅手机生效 */
    sheetMaxHeight?: string;
    /** sheet 的最小高度，仅手机生效 */
    sheetMinHeight?: string;
    /**
     * sheet 是否允许点击遮罩关闭；仅手机生效。
     * 未显式设置时默认继承 `dismissableMask`（与桌面语义对齐）。
     */
    sheetDismissOnMaskClick?: boolean;
    /** sheet body 是否全出血（消除默认 padding）；仅手机生效 */
    sheetFullBleed?: boolean;
    /** PrimeVue Dialog 属性 */
    modal?: boolean;
    closable?: boolean;
    dismissableMask?: boolean;
    closeOnEscape?: boolean;
    draggable?: boolean;
    /** 追加到 Dialog 的 class；手机 sheet 忽略 */
    dialogClass?: string;
  }>(),
  {
    header: '',
    eyebrow: '',
    desktopWidth: '32rem',
    sheetMaxHeight: '92dvh',
    sheetMinHeight: '80dvh',
    // 不设默认值 → undefined 表示"未显式设置"，运行时回退到 dismissableMask
    sheetFullBleed: false,
    modal: true,
    closable: true,
    dismissableMask: true,
    closeOnEscape: true,
    draggable: false,
    dialogClass: '',
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { dialogStyle, dialogClass: adaptiveClass, isPhone } = useAdaptiveDialog({
  desktopWidth: props.desktopWidth,
  ...(props.desktopHeight ? { desktopHeight: props.desktopHeight } : {}),
  ...(props.tabletWidth ? { tabletWidth: props.tabletWidth } : {}),
  ...(props.tabletHeight ? { tabletHeight: props.tabletHeight } : {}),
});

const mergedDialogClass = computed(() =>
  [adaptiveClass.value, props.dialogClass].filter(Boolean).join(' '),
);

// 未显式设置 sheetDismissOnMaskClick 时，沿用桌面侧 dismissableMask 的意图
const effectiveSheetDismiss = computed(() =>
  props.sheetDismissOnMaskClick !== undefined ? props.sheetDismissOnMaskClick : props.dismissableMask,
);

const handleVisibleChange = (next: boolean) => emit('update:visible', next);
</script>

<template>
  <!-- 手机：MobileBottomSheet -->
  <MobileBottomSheet
    v-if="isPhone"
    :visible="visible"
    :title="header"
    :eyebrow="eyebrow"
    :max-height="sheetMaxHeight"
    :min-height="sheetMinHeight"
    :closable="closable"
    :dismiss-on-mask-click="effectiveSheetDismiss"
    :full-bleed="sheetFullBleed"
    @update:visible="handleVisibleChange"
  >
    <slot />
    <template v-if="$slots.footer" #footer="{ close }">
      <slot name="footer" :close="close" />
    </template>
  </MobileBottomSheet>

  <!-- 桌面 / 平板：PrimeVue Dialog -->
  <Dialog
    v-else
    :visible="visible"
    :header="header"
    :modal="modal"
    :closable="closable"
    :dismissable-mask="dismissableMask"
    :close-on-escape="closeOnEscape"
    :draggable="draggable"
    :style="dialogStyle"
    :class="mergedDialogClass"
    @update:visible="handleVisibleChange"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" :close="() => handleVisibleChange(false)" />
    </template>
  </Dialog>
</template>
