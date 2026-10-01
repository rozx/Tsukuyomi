import { app } from 'electron';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

/** 原生能力仅提供给本应用主窗口顶层页面。 */
export function trustedDesktopSender(
  event: IpcMainInvokeEvent | IpcMainEvent,
  window: BrowserWindow | null,
) {
  return (
    window !== null &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    (event.senderFrame.url.startsWith('file:') ||
      (!app.isPackaged && event.senderFrame.url.startsWith('http://localhost:9000/')))
  );
}
