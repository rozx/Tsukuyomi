import { app, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { resolveAppLocale } from '../src/models/locale';
import { nativeText, setNativeLocale } from './native-text';
import { trustedDesktopSender } from './trusted-sender';

export function registerNativeLocale(getWindow: () => BrowserWindow | null, changed: () => void) {
  setNativeLocale(resolveAppLocale(undefined, app.getPreferredSystemLanguages()));
  ipcMain.handle('interface-locale:set', (event, value: unknown) => {
    if (!trustedDesktopSender(event, getWindow()))
      throw new Error(nativeText('native.invalidSource'));
    setNativeLocale(value);
    changed();
  });
}
