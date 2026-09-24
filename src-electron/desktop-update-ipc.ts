import { app, dialog, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent, IpcMainEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { UpdateManager, GithubSource } from 'velopack';
import type { UpdateInfo } from 'velopack';
import { DesktopUpdater } from './desktop-updater';

interface UpdateTarget {
  version: string;
  info: UpdateInfo;
}

/** 仅主窗口顶层页面可调用更新 API，抓取窗口和 iframe 没有安装权限。 */
function trusted(event: IpcMainInvokeEvent | IpcMainEvent, window: BrowserWindow | null) {
  return (
    window !== null &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    (event.senderFrame.url.startsWith('file:') ||
      (!app.isPackaged && event.senderFrame.url.startsWith('http://localhost:9000/')))
  );
}

export function registerDesktopUpdates(getWindow: () => BrowserWindow | null) {
  let manager: UpdateManager | undefined;
  let unavailable: string | undefined;
  try {
    if (!app.isPackaged) throw new Error('开发环境不检查更新');
    manager = new UpdateManager(new GithubSource('https://github.com/rozx/Tsukuyomi'), {
      AllowVersionDowngrade: false,
      MaximumDeltasBeforeFallback: 10,
    });
    manager.getCurrentVersion();
  } catch {
    unavailable = app.isPackaged
      ? '此应用尚未使用更新包分发，请先下载便携发布版。'
      : '开发环境不检查更新';
  }
  const send = (channel: string, value?: unknown) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
  };
  let cancelPreparation: (() => void) | undefined;
  const updater: DesktopUpdater<UpdateTarget> = new DesktopUpdater<UpdateTarget>({
    version: app.getVersion(),
    ...(unavailable ? { unavailable } : {}),
    check: async () => {
      const info = await manager!.checkForUpdatesAsync();
      if (info?.IsDowngrade) throw new Error('拒绝降级更新');
      return info ? { version: info.TargetFullRelease.Version, info } : null;
    },
    download: async (target, progress) => {
      await manager!.downloadUpdateAsync(target.info, progress);
    },
    publish: (state) => send('desktop-update:state', state),
    confirm: async () => {
      const window = getWindow();
      if (!window || window.isDestroyed()) return false;
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: '重启并更新',
        buttons: ['取消', '重启并更新'],
        defaultId: 0,
        cancelId: 0,
        message: `将更新到 ${updater.snapshot().targetVersion}`,
        detail:
          '请先保存正在编辑的内容。应用会检查是否仍有翻译、导入、同步或保存任务，空闲后才能重启。',
      });
      return result.response === 1;
    },
    prepare: () =>
      new Promise<void>((resolve, reject) => {
        const window = getWindow();
        if (!window || window.isDestroyed()) {
          reject(new Error('主窗口不可用'));
          return;
        }
        const id = randomUUID();
        const finish = (error?: Error) => {
          clearTimeout(timer);
          ipcMain.removeListener('desktop-update:prepared', receive);
          cancelPreparation = undefined;
          if (error) reject(error);
          else resolve();
        };
        const receive = (event: IpcMainEvent, response: { id?: string; error?: string }) => {
          if (!trusted(event, window) || response?.id !== id) return;
          finish(response.error ? new Error(String(response.error).slice(0, 500)) : undefined);
        };
        const timer = setTimeout(() => finish(new Error('准备重启超时，请稍后重试')), 10_000);
        cancelPreparation = () => finish(new Error('应用正在退出'));
        ipcMain.on('desktop-update:prepared', receive);
        send('desktop-update:prepare', id);
      }),
    release: () => send('desktop-update:release'),
    install: (target) => {
      manager!.waitExitThenApplyUpdate(target.info, false, true);
      app.quit();
    },
  });

  for (const action of ['getState', 'check', 'restart'] as const) {
    ipcMain.handle(`desktop-update:${action}`, async (event) => {
      if (!trusted(event, getWindow())) throw new Error('更新请求来源无效');
      if (action !== 'getState') await updater[action]();
      return updater.snapshot();
    });
  }
  const firstCheck = setTimeout(() => {
    void updater.check();
  }, 30_000);
  const recurring = setInterval(
    () => {
      void updater.check();
    },
    6 * 60 * 60 * 1000,
  );
  app.once('will-quit', () => {
    clearTimeout(firstCheck);
    clearInterval(recurring);
    cancelPreparation?.();
  });
}
