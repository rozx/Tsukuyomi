export const PHONE_MAX_WIDTH = 767;
// 覆盖 iPad Pro 12.9"（1366px 横屏）在内的所有 iPad 尺寸；
// 典型笔记本起步 1440px 起走 desktop 分支。
export const TABLET_MAX_WIDTH = 1366;

export type DeviceType = 'phone' | 'tablet' | 'desktop';
export type BookWorkspaceMode = 'content' | 'catalog' | 'settings' | 'progress';

export const DEFAULT_BOOK_WORKSPACE_MODE: BookWorkspaceMode = 'content';

export const getDeviceTypeByWidth = (width: number): DeviceType => {
  if (width <= PHONE_MAX_WIDTH) {
    return 'phone';
  }
  if (width <= TABLET_MAX_WIDTH) {
    return 'tablet';
  }
  return 'desktop';
};

