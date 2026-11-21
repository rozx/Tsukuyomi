/**
 * 任务中心固定面板（悬浮窗）的位置与尺寸计算。纯函数，便于测试；
 * 坐标均为视口坐标（px），面板从左上角定位，缩放手柄在右边 / 下边 / 右下角。
 */

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

type Box = Point & Size;

/** 与视口边缘保持的最小距离 */
const MARGIN = 8;
const DEFAULT_WIDTH = 440;
const DEFAULT_MAX_HEIGHT = 600;
/** 默认位置：右侧留白、紧贴顶部标题栏下方 */
const DEFAULT_RIGHT_GAP = 16;
const DEFAULT_TOP = 56;

export const PINNED_PANEL_MIN: Readonly<Size> = { width: 340, height: 260 };

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** 未保存尺寸时的默认尺寸：宽 440，高为视口 70%（不超过 600、不低于最小高度） */
export function defaultPanelSize(viewport: Size): Size {
  return {
    width: Math.max(PINNED_PANEL_MIN.width, Math.min(DEFAULT_WIDTH, viewport.width - MARGIN * 2)),
    height: Math.max(
      PINNED_PANEL_MIN.height,
      Math.min(DEFAULT_MAX_HEIGHT, Math.round(viewport.height * 0.7)),
    ),
  };
}

/** 未保存位置时的默认位置：右上角 */
export function defaultPanelPosition(size: Size, viewport: Size): Point {
  return {
    x: Math.max(MARGIN, viewport.width - size.width - DEFAULT_RIGHT_GAP),
    y: DEFAULT_TOP,
  };
}

/** 把位置限制在视口内 */
export function clampPanelPosition(pos: Point, size: Size, viewport: Size): Point {
  return {
    x: clampNumber(pos.x, MARGIN, viewport.width - size.width - MARGIN),
    y: clampNumber(pos.y, MARGIN, viewport.height - size.height - MARGIN),
  };
}

/** 拖动缩放：不小于最小尺寸，从当前位置向右 / 向下不超出视口 */
export function clampPanelSize(size: Size, pos: Point, viewport: Size): Size {
  return {
    width: clampNumber(size.width, PINNED_PANEL_MIN.width, viewport.width - pos.x - MARGIN),
    height: clampNumber(size.height, PINNED_PANEL_MIN.height, viewport.height - pos.y - MARGIN),
  };
}

/** 收起后的迷你进度条尺寸（宽度固定，高度约为一行） */
export const PINNED_MINI_SIZE: Readonly<Size> = { width: 280, height: 40 };

/**
 * 显示用的位置与尺寸：保存的值（用户拖动的结果）保持不变，只在显示时适配当前视口——
 * 窗口比面板小时先收缩尺寸再推回视口内；窗口恢复后按保存的值显示。
 * 收起为迷你条时只按迷你条尺寸限制位置（迷你条可以停在窗口底部）。
 */
export function displayPanelBox(box: Box, viewport: Size, collapsed: boolean): Box {
  if (collapsed) {
    return {
      ...clampPanelPosition(box, PINNED_MINI_SIZE, viewport),
      width: box.width,
      height: box.height,
    };
  }
  const size = {
    width: clampNumber(box.width, PINNED_PANEL_MIN.width, viewport.width - MARGIN * 2),
    height: clampNumber(box.height, PINNED_PANEL_MIN.height, viewport.height - MARGIN * 2),
  };
  return { ...clampPanelPosition(box, size, viewport), ...size };
}
