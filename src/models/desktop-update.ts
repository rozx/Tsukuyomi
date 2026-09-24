export interface DesktopUpdateState {
  phase:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'ready'
    | 'preparing'
    | 'installing'
    | 'error';
  currentVersion: string;
  targetVersion?: string | undefined;
  progress?: number | undefined;
  message?: string | undefined;
  /** 最近一次成功完成检查的时间戳；用于区分“已确认最新”和“尚未检查”。 */
  checkedAt?: number | undefined;
}

export interface DesktopUpdateAPI {
  getState: () => Promise<DesktopUpdateState>;
  check: () => Promise<DesktopUpdateState>;
  restart: () => Promise<DesktopUpdateState>;
  onState: (callback: (state: DesktopUpdateState) => void) => () => void;
  onPrepare: (callback: () => Promise<void>) => () => void;
  onRelease: (callback: () => void) => () => void;
}
