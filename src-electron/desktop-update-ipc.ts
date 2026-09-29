import { nativeText } from './native-text';
import { trustedDesktopSender as trusted } from './trusted-sender';
import { app, dialog, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { UpdateManager, GithubSource } from 'velopack';
import type { UpdateInfo } from 'velopack';
import { DesktopUpdater } from './desktop-updater';

interface UpdateTarget {
  version: string;
  info: UpdateInfo;
}

export function registerDesktopUpdates(getWindow: () => BrowserWindow | null) {
  let manager: UpdateManager | undefined;
  let unavailable: (() => string) | undefined;
  try {
    if (!app.isPackaged) throw new Error(nativeText('native.noDevUpdates'));
    manager = new UpdateManager(new GithubSource('https://github.com/rozx/Tsukuyomi'), {
      AllowVersionDowngrade: false,
      MaximumDeltasBeforeFallback: 10,
    });
    manager.getCurrentVersion();
  } catch {
    unavailable = () =>
      nativeText(app.isPackaged ? 'native.portableRequired' : 'native.noDevUpdates');
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
      if (info?.IsDowngrade) throw new Error(nativeText('native.downgradeDenied'));
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
        title: nativeText('native.restartUpdate'),
        buttons: [nativeText('native.cancel'), nativeText('native.restartUpdate')],
        defaultId: 0,
        cancelId: 0,
        message: nativeText('native.updateVersion', {
          version: updater.snapshot().targetVersion ?? '',
        }),
        detail: nativeText('native.updateDetail'),
      });
      return result.response === 1;
    },
    prepare: () =>
      new Promise<void>((resolve, reject) => {
        const window = getWindow();
        if (!window || window.isDestroyed()) {
          reject(new Error(nativeText('native.windowUnavailable')));
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
          finish(
            response.error
              ? new Error(
                  response.error === 'DESKTOP_SAVE_CHECK_FAILED'
                    ? nativeText('native.prepareFailed')
                    : String(response.error).slice(0, 500),
                )
              : undefined,
          );
        };
        const timer = setTimeout(
          () => finish(new Error(nativeText('native.prepareTimeout'))),
          10_000,
        );
        cancelPreparation = () => finish(new Error(nativeText('native.quitting')));
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
      if (!trusted(event, getWindow())) throw new Error(nativeText('native.invalidUpdateSource'));
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
  return () => send('desktop-update:state', updater.snapshot());
}
