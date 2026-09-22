/**
 * Electron 单实例守卫。
 *
 * 同一 userData 工作区只允许一个进程：跨进程时 Web Locks 不互斥，第二个进程也无法打开
 * 同一 IndexedDB。锁只在一个进程内有效，导入执行、书籍写入占用等互斥才能直接依赖 Web Locks。
 * 第二次启动交给已有实例唤醒工作台，不另起窗口进程。
 */

export interface SingleInstanceWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): unknown;
}

interface SingleInstanceHandlers {
  getWindow: () => SingleInstanceWindow | null;
  createWindow: () => void;
}

/**
 * 申请单实例锁；返回 false 时当前进程已请求退出，调用方不得继续启动
 */
export function claimSingleInstance(
  app: SingleInstanceApp,
  handlers: SingleInstanceHandlers,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }

  // second-instance 保证在 ready 之后触发，此时可以安全创建窗口
  app.on('second-instance', () => {
    const window = handlers.getWindow();
    if (!window || window.isDestroyed()) {
      handlers.createWindow();
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  return true;
}
