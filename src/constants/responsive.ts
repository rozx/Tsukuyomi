export const PHONE_MAX_WIDTH = 767;
export const TABLET_MAX_WIDTH = 1279;

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

