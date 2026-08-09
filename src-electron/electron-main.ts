import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import pie from 'puppeteer-in-electron';
import { getErrorMessage, toError } from '../src/utils/error-message';
import { getCookieHeaderValue, omitCookieHeader, parseCookieHeader } from './puppeteer-cookies';

// Configure Puppeteer Stealth
puppeteer.use(StealthPlugin());

// Initialize puppeteer-in-electron
console.log('[Electron] Initializing puppeteer-in-electron...');
await pie.initialize(app);
console.log('[Electron] puppeteer-in-electron initialized');
app.commandLine.appendSwitch('remote-debugging-port', '8315');

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 保持对窗口对象的全局引用，否则窗口会被自动关闭
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let browserPromise: Promise<Browser> | null = null;

// 检测是否为开发环境
// 优先检查 app.isPackaged（Electron 打包后的标志）
// 然后检查环境变量
const isDev =
  !app.isPackaged && (process.env.DEV === 'true' || process.env.NODE_ENV !== 'production');
// 调试模式：通过环境变量控制是否打开开发者工具（用于调试构建）
const isDebugMode = process.env.ELECTRON_DEBUG === 'true' || isDev;

// 记录环境信息以便调试
console.log('[Electron] Environment info:', {
  isPackaged: app.isPackaged,
  NODE_ENV: process.env.NODE_ENV,
  DEV: process.env.DEV,
  ELECTRON_DEBUG: process.env.ELECTRON_DEBUG,
  isDev,
  isDebugMode,
  platform: process.platform,
  arch: process.arch,
});

// Normal App Logic

// 处理加载错误的辅助函数
function handleLoadError(window: BrowserWindow | null, err: unknown, path: string) {
  console.error('[Electron] Error details:', {
    code: (err as { code?: string }).code,
    message: getErrorMessage(err),
    path,
  });
  // 尝试使用 loadURL 作为备选方案
  if (window) {
    const fileUrl = `file://${path}`;
    console.log(`[Electron] Trying alternative: ${fileUrl}`);
    void window.loadURL(fileUrl).catch((urlErr) => {
      console.error('[Electron] Failed to load via URL:', urlErr);
    });
  }
}

function resolveSplashLogoBase64(): string {
  const candidates = [
    join(__dirname, '..', 'icons', 'android-chrome-512x512.png'),
    join(__dirname, '..', '..', 'public', 'icons', 'android-chrome-512x512.png'),
    join(process.resourcesPath || __dirname, 'icons', 'android-chrome-512x512.png'),
    join(process.resourcesPath || __dirname, 'public', 'icons', 'android-chrome-512x512.png'),
    join(__dirname, 'icons', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return readFileSync(p).toString('base64');
    } catch {
      // 继续尝试下一个候选路径
    }
  }
  return '';
}

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 360,
    height: 380,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const logoBase64 = resolveSplashLogoBase64();
  const logoSrc = logoBase64 ? `data:image/png;base64,${logoBase64}` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: transparent; overflow: hidden; user-select: none; -webkit-app-region: drag; }
  .wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; font-family: 'Noto Serif JP', 'Songti SC', 'Noto Serif SC', serif; color: #e6def5; }
  .logo { width: 168px; height: 168px; border-radius: 50%; background-color: #1a1538; background-size: cover; background-position: center; box-shadow: 0 0 36px rgba(180, 140, 255, 0.45); animation: pulse 2.4s ease-in-out infinite; }
  .title { font-size: 22px; letter-spacing: 8px; font-weight: 600; color: #e6def5; }
  .sub { font-size: 10px; letter-spacing: 4px; opacity: 0.55; font-family: 'JetBrains Mono', Consolas, monospace; color: #c9b4ff; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 24px rgba(180, 140, 255, 0.30); }
    50% { box-shadow: 0 0 48px rgba(180, 140, 255, 0.60); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="logo" style="background-image: url('${logoSrc}')"></div>
    <div class="title">月 詠</div>
    <div class="sub">TSUKUYOMI</div>
  </div>
</body>
</html>`;

  void splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return splash;
}

function closeSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function resolvePreloadPath(): string | null {
  const candidates = [
    // Packaged layout (Quasar places it under preload/ and .cjs extension)
    join(__dirname, 'preload', 'electron-preload.cjs'),
    // UnPackaged dev build (sometimes .cjs or .js)
    join(__dirname, 'electron-preload.cjs'),
    join(__dirname, 'electron-preload.js'),
    // Fallback relative parent (rare, but keep for safety)
    join(__dirname, '../preload/electron-preload.cjs'),
    join(__dirname, '../electron-preload.cjs'),
    join(__dirname, '../electron-preload.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log('[Electron] Using preload script:', p);
      return p;
    }
  }
  console.error('[Electron] No preload script found in candidates:', candidates);
  return null;
}

function loadDevServer(): void {
  if (!mainWindow) return;
  const devUrl = 'http://localhost:9000';
  console.log(`[Electron] Loading dev server: ${devUrl}`);
  void mainWindow.loadURL(devUrl).catch((err) => {
    console.error('[Electron] Failed to load dev server:', err);
    console.error('[Electron] Make sure Vite dev server is running on port 9000');
    if (!mainWindow) return;
    const indexPath = join(__dirname, '../index.html');
    console.log(`[Electron] Falling back to: ${indexPath}`);
    void mainWindow.loadFile(indexPath).catch((fileErr) => {
      console.error('[Electron] Failed to load file:', fileErr);
    });
  });
  if (isDebugMode) mainWindow.webContents.openDevTools();
}

function resolveProductionIndexPaths(): string[] {
  return [
    join(__dirname, 'index.html'),
    join(__dirname, '../index.html'),
    join(process.resourcesPath || __dirname, 'index.html'),
    join(process.resourcesPath || __dirname, '../index.html'),
  ];
}

function logProductionBuildDiagnostics(possiblePaths: string[], indexPath: string): void {
  console.log(`[Electron] Loading production build`);
  console.log(`[Electron] __dirname: ${__dirname}`);
  console.log(`[Electron] process.resourcesPath: ${process.resourcesPath || 'undefined'}`);
  console.log(`[Electron] indexPath: ${indexPath}`);
  console.log(`[Electron] File exists: ${existsSync(indexPath)}`);
  console.log(
    `[Electron] Tried paths:`,
    possiblePaths.map((p) => ({ path: p, exists: existsSync(p) })),
  );
  if (!isDebugMode) return;
  try {
    const files = readdirSync(__dirname);
    console.log(`[Electron] Files in __dirname:`, files.slice(0, 10));
    if (process.resourcesPath && process.resourcesPath !== __dirname) {
      try {
        const resourceFiles = readdirSync(process.resourcesPath);
        console.log(`[Electron] Files in process.resourcesPath:`, resourceFiles.slice(0, 10));
      } catch (e) {
        console.error('[Electron] Failed to read resourcesPath directory:', e);
      }
    }
  } catch (e) {
    console.error('[Electron] Failed to read directory:', e);
  }
}

function showMissingIndexFallback(possiblePaths: string[]): void {
  console.error('[Electron] index.html not found in any of the tried paths!');
  console.error(`[Electron] Tried paths:`, possiblePaths);
  if (!mainWindow) return;
  mainWindow.show();
  if (!isDebugMode) return;
  void mainWindow.webContents.executeJavaScript(`
    document.body.innerHTML = '<div style="padding: 20px; font-family: monospace; color: red;">
      <h1>File Not Found</h1>
      <p>index.html not found in any of the following paths:</p>
      <ul>
        ${possiblePaths.map((p) => `<li>${p}</li>`).join('')}
      </ul>
      <p>Check console for more details.</p>
    </div>';
  `);
}

function openDevToolsDelayed(delayMs: number): void {
  setTimeout(() => {
    if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.openDevTools();
    }
  }, delayMs);
}

function loadProductionBuild(): void {
  if (!mainWindow) return;
  const possiblePaths = resolveProductionIndexPaths();
  const foundPath = possiblePaths.find((path) => existsSync(path));
  const indexPath = foundPath || possiblePaths[0] || join(__dirname, 'index.html');
  logProductionBuildDiagnostics(possiblePaths, indexPath);

  if (existsSync(indexPath)) {
    void mainWindow.loadFile(indexPath).catch((err) => {
      console.error('[Electron] Failed to load index.html:', err);
      handleLoadError(mainWindow, err, indexPath);
    });
  } else {
    showMissingIndexFallback(possiblePaths);
  }

  if (isDebugMode) openDevToolsDelayed(500);
}

function createWindow() {
  const preloadPath = resolvePreloadPath();
  if (!preloadPath) {
    console.warn('[Electron] Proceeding without preload. electronAPI will be unavailable.');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      ...(preloadPath ? { preload: preloadPath } : {}),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  if (isDev) loadDevServer();
  else loadProductionBuild();

  // 监听页面加载完成事件
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Page loaded successfully');

    // 检查页面内容
    if (mainWindow && isDebugMode) {
      void mainWindow.webContents.executeJavaScript(`
        console.log('[Page] Document ready state:', document.readyState);
        console.log('[Page] App element exists:', !!document.getElementById('q-app'));
        console.log('[Page] Scripts loaded:', Array.from(document.scripts).map(s => s.src));
        console.log('[Page] Stylesheets loaded:', Array.from(document.styleSheets).length);
      `);
    }
  });

  // 使用 ready-to-show 事件来显示窗口，这是更推荐的做法
  mainWindow.once('ready-to-show', () => {
    console.log('[Electron] Requesting to show window (ready-to-show)');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
    closeSplashWindow();
  });

  // 添加一个安全超时，如果 ready-to-show 没有触发，强制显示窗口
  let forceShowTimeout: NodeJS.Timeout | undefined = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[Electron] Window did not show within 10s, forcing show');
      mainWindow.show();
    }
    closeSplashWindow();
  }, 10000);

  // 在窗口关闭时清理安全超时，避免在已销毁窗口上调用 show
  mainWindow.on('closed', () => {
    if (forceShowTimeout) {
      clearTimeout(forceShowTimeout);
      forceShowTimeout = undefined;
    }
  });

  // 监听页面加载失败事件（主框架和子资源）
  mainWindow.webContents.on(
    'did-fail-load',
    (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error('[Electron] Main frame failed to load:', {
          errorCode,
          errorDescription,
          validatedURL,
        });
        if (mainWindow) {
          mainWindow.show(); // 即使加载失败也显示窗口，以便查看错误
          // 在调试模式下，显示错误页面
          if (isDebugMode) {
            void mainWindow.webContents.executeJavaScript(`
            document.body.innerHTML = '<div style="padding: 20px; font-family: monospace;">
              <h1>Electron Load Error</h1>
              <p><strong>Error Code:</strong> ${errorCode}</p>
              <p><strong>Description:</strong> ${errorDescription}</p>
              <p><strong>URL:</strong> ${validatedURL}</p>
              <p>Check the console for more details.</p>
            </div>';
          `);
          }
        }
      } else {
        console.warn('[Electron] Resource failed to load:', {
          errorCode,
          errorDescription,
          validatedURL,
        });
      }
    },
  );

  // 监听 DOM 就绪事件
  mainWindow.webContents.on('dom-ready', () => {
    console.log('[Electron] DOM ready');
  });

  // 监听控制台消息（用于调试）
  if (isDebugMode) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Electron Console ${level}]:`, message, `(${sourceId}:${line})`);
    });
  }

  // 强制打开开发者工具（用于调试）
  if (isDebugMode) {
    // 延迟打开，确保窗口已创建
    setTimeout(() => {
      if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.openDevTools();
      }
    }, 1000);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建应用菜单
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS 应用菜单
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: `关于 ${app.name}`,
                click: () => {
                  app.showAboutPanel();
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    // 文件菜单
    {
      label: '文件',
      submenu: [
        {
          label: '导出设置...',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            void (async () => {
              if (!mainWindow) return;
              const result = await dialog.showSaveDialog(mainWindow, {
                title: '导出设置',
                defaultPath: `tsukuyomi-settings-${new Date().toISOString().split('T')[0]}.json`,
                filters: [
                  { name: 'JSON Files', extensions: ['json'] },
                  { name: 'All Files', extensions: ['*'] },
                ],
              });

              if (!result.canceled && result.filePath) {
                // 重新检查 mainWindow 是否仍然存在（可能在对话框打开期间窗口被关闭）
                if (!mainWindow) return;
                // 通过 IPC 请求渲染进程的设置数据
                mainWindow.webContents.send('export-settings-request', result.filePath);
              }
            })();
          },
        },
        {
          label: '导入设置...',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            void (async () => {
              if (!mainWindow) return;
              const result = await dialog.showOpenDialog(mainWindow, {
                title: '导入设置',
                filters: [
                  { name: 'JSON Files', extensions: ['json'] },
                  { name: 'Text Files', extensions: ['txt'] },
                  { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
              });

              if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                if (filePath) {
                  try {
                    const content = readFileSync(filePath, 'utf-8');
                    // 重新检查 mainWindow 是否仍然存在（可能在对话框打开期间窗口被关闭）
                    // 在发送前再次检查，确保窗口仍然存在
                    if (!mainWindow) return;
                    mainWindow.webContents.send('import-settings-data', content);
                  } catch (error) {
                    dialog.showErrorBox(
                      '导入失败',
                      error instanceof Error ? error.message : '读取文件时发生错误',
                    );
                  }
                }
              }
            })();
          },
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    // 编辑菜单 (Edit) - 处理复制/粘贴等操作
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const, label: '撤销' },
        { role: 'redo' as const, label: '重做' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: '剪切' },
        { role: 'copy' as const, label: '复制' },
        { role: 'paste' as const, label: '粘贴' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const, label: '粘贴并匹配样式' },
              { role: 'delete' as const, label: '删除' },
              { role: 'selectAll' as const, label: '全选' },
              { type: 'separator' as const },
              {
                label: '语音',
                submenu: [
                  { role: 'startSpeaking' as const, label: '开始朗读' },
                  { role: 'stopSpeaking' as const, label: '停止朗读' },
                ],
              },
            ]
          : [
              { role: 'delete' as const, label: '删除' },
              { type: 'separator' as const },
              { role: 'selectAll' as const, label: '全选' },
            ]),
      ],
    },
    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload' as const, label: '重新加载' },
        { role: 'forceReload' as const, label: '强制重新加载' },
        { role: 'toggleDevTools' as const, label: '切换开发者工具' },
        { role: 'togglefullscreen' as const, label: '切换全屏' },
      ],
    },
    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '了解更多',
          click: () => {
            void shell.openExternal('https://github.com/rozx/Tsukuyomi');
          },
        },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: `关于 ${app.name}`,
                click: () => {
                  app.showAboutPanel();
                },
              },
            ]
          : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

type ElectronFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
};

const ensureBrowserPromise = () => {
  if (browserPromise) return browserPromise;
  // Note: pie.connect returns a Browser instance that controls the Electron app
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browserPromise = pie.connect(app, puppeteer as any);
  browserPromise.catch((error) => {
    console.error('[Electron Fetch] Browser connection failed:', error);
    browserPromise = null;
  });
  return browserPromise;
};

const createScrapingWindow = (): BrowserWindow =>
  new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // 禁用 webSecurity 以允许爬虫服务绕过 CORS 限制
      webSecurity: false,
    },
  });

const isBrowserConnectionError = (err: unknown): boolean => {
  const message = getErrorMessage(err);
  return (
    message.includes('connect') ||
    message.includes('browser') ||
    message.includes('disconnected') ||
    message.includes('target closed')
  );
};

type ElectronFetchResponse = {
  status: number;
  statusText: string;
  headers: Record<string, never>;
  data: string;
};

async function applyRequestCookies(page: Page, headers: Record<string, string> | undefined, url: string) {
  const cookieHeader = getCookieHeaderValue(headers);
  if (!cookieHeader) return;
  const cookies = parseCookieHeader(cookieHeader, url);
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

async function fetchUrlViaPuppeteer(
  url: string,
  options: ElectronFetchOptions | undefined,
  window: BrowserWindow,
): Promise<ElectronFetchResponse> {
  const browser = await ensureBrowserPromise();
  const page = await pie.getPage(browser, window);
  page.setDefaultNavigationTimeout(options?.timeout || 60000);
  await applyRequestCookies(page, options?.headers, url);
  const headersWithoutCookie = omitCookieHeader(options?.headers);
  if (Object.keys(headersWithoutCookie).length > 0) {
    await page.setExtraHTTPHeaders(headersWithoutCookie);
  }
  console.log(`[Electron Fetch] Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait for content (Stealth handles most Cloudflare checks; small buffer for the rest)
  await new Promise((r) => setTimeout(r, 2000));
  const content = await page.content();
  console.log(`[Electron Fetch] Page loaded: ${await page.title()}`);
  return { status: 200, statusText: 'OK', headers: {}, data: content };
}

function handleElectronFetchError(err: unknown, window: BrowserWindow | null): never {
  console.error('[Electron Fetch] Puppeteer error:', err);
  if (isBrowserConnectionError(err)) {
    console.log('[Electron Fetch] Resetting browserPromise due to connection error');
    browserPromise = null;
  }
  if (window && !window.isDestroyed()) window.close();
  throw toError(err);
}

async function performElectronFetch(
  url: string,
  options: ElectronFetchOptions | undefined,
): Promise<ElectronFetchResponse> {
  console.log(`[Electron Fetch] Launching Puppeteer for ${url}`);
  const window = createScrapingWindow();
  try {
    const response = await fetchUrlViaPuppeteer(url, options, window);
    window.close();
    return response;
  } catch (err) {
    handleElectronFetchError(err, window);
  }
}

// IPC handler for electron-fetch using Puppeteer (Stealth)
ipcMain.handle('electron-fetch', (_event, url: string, options?: ElectronFetchOptions) =>
  performElectronFetch(url, options),
);

// IPC handler for saving exported settings
ipcMain.on('export-settings-save', (_event, filePath: string, data: string) => {
  try {
    writeFileSync(filePath, data, 'utf-8');
    if (mainWindow) {
      void dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '导出成功',
        message: '设置已成功导出',
        detail: `文件已保存到:
${filePath}`,
      });
    }
  } catch (error) {
    if (mainWindow) {
      dialog.showErrorBox(
        '导出失败',
        error instanceof Error ? error.message : '保存文件时发生错误',
      );
    }
  }
});

void app.whenReady().then(() => {
  // 设置 About 面板信息
  app.setAboutPanelOptions({
    applicationName: 'Tsukuyomi - Moonlit Translator',
    applicationVersion: app.getVersion(),
    version: `Version ${app.getVersion()}`,
    copyright: '© 2025 rozx',
    credits: 'Built with Electron, Quasar, and Vue 3',
    website: 'https://github.com/rozx/Tsukuyomi',
  });

  createMenu();
  splashWindow = createSplashWindow();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
