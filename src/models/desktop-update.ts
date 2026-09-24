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
}

export interface DesktopUpdateAPI {
  getState: () => Promise<DesktopUpdateState>;
  check: () => Promise<DesktopUpdateState>;
  restart: () => Promise<DesktopUpdateState>;
  onState: (callback: (state: DesktopUpdateState) => void) => () => void;
  onPrepare: (callback: () => Promise<void>) => () => void;
  onRelease: (callback: () => void) => () => void;
}
