import {
  app,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import type { DesktopMcpIpcResponse, DesktopMcpStartConfig } from '../src/models/desktop-mcp';
import { trustedDesktopSender } from './trusted-sender';
import { createElectronMcpCoordinator } from './mcp-coordinator';

export function registerElectronMcpIpc(getWindow: () => BrowserWindow | null) {
  const coordinator = createElectronMcpCoordinator({
    getWindow,
    isTrusted: trustedDesktopSender,
    version: app.getVersion(),
  });

  ipcMain.handle('agent-mcp:start', (event: IpcMainInvokeEvent, config: DesktopMcpStartConfig) =>
    coordinator.handleStart(event, config),
  );
  ipcMain.handle('agent-mcp:stop', (event: IpcMainInvokeEvent) => coordinator.handleStop(event));
  ipcMain.handle(
    'agent-mcp:updateConfig',
    (event: IpcMainInvokeEvent, config: DesktopMcpStartConfig) =>
      coordinator.handleUpdateConfig(event, config),
  );
  ipcMain.handle('agent-mcp:getStatus', (event: IpcMainInvokeEvent) =>
    coordinator.handleGetStatus(event),
  );
  ipcMain.on('agent-mcp:response', (event: IpcMainEvent, response: DesktopMcpIpcResponse) =>
    coordinator.handleRendererResponse(event, response),
  );

  ipcMain.on('agent-mcp:ready', (event: IpcMainEvent) => coordinator.handleRendererReady(event));

  app.on('will-quit', () => {
    void coordinator.dispose();
  });

  return {
    onWindowClosed: () => coordinator.onWindowClosed(),
    onRendererReset: () => coordinator.onRendererReset(),
    dispose: () => coordinator.dispose(),
  };
}
