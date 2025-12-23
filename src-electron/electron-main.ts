import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import puppeteer from 'puppeteer-extra';
import type { Browser } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import pie from 'puppeteer-in-electron';

// Configure Puppeteer Stealth
puppeteer.use(StealthPlugin());

// Initialize puppeteer-in-electron
await pie.initialize(app);
app.commandLine.appendSwitch('remote-debugging-port', '8315');

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 保持对窗口对象的全局引用，否则窗口会被自动关闭
let mainWindow: BrowserWindow | null = null;
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
    message: err instanceof Error ? err.message : String(err),
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

function createWindow() {
  const preloadPath = resolvePreloadPath();
  if (!preloadPath) {
    console.warn('[Electron] Proceeding without preload. electronAPI will be unavailable.');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff', // 设置背景色以减少白屏闪烁
    show: false, // 先不显示窗口，等内容加载完成后再显示
    webPreferences: {
      // 仅当找到 preload 文件时才设置
      ...(preloadPath ? { preload: preloadPath } : {}),
      nodeIntegration: false,
      contextIsolation: true,
      // 禁用 webSecurity 以允许爬虫服务通过 Electron fetch API 绕过 CORS 限制
      // 这是安全的，因为我们控制所有请求的来源
      webSecurity: false,
    },
  });

  // 开发环境加载开发服务器，生产环境加载构建后的文件
  if (isDev) {
    const devUrl = 'http://localhost:9000';
    console.log(`[Electron] Loading dev server: ${devUrl}`);
    void mainWindow.loadURL(devUrl).catch((err) => {
      console.error('[Electron] Failed to load dev server:', err);
      console.error('[Electron] Make sure Vite dev server is running on port 9000');
      // 如果开发服务器不可用，尝试加载生产构建
      if (mainWindow) {
        const indexPath = join(__dirname, '../index.html');
        console.log(`[Electron] Falling back to: ${indexPath}`);
        void mainWindow.loadFile(indexPath).catch((fileErr) => {
          console.error('[Electron] Failed to load file:', fileErr);
        });
      }
    });
    if (isDebugMode) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // 生产环境：加载构建后的文件
    // 在 Quasar 构建中，index.html 与 electron-main.js 在同一目录
    // 对于打包后的应用，路径可能有所不同
    // 尝试多个可能的路径
    const possiblePaths = [
      join(__dirname, 'index.html'), // 标准路径
      join(__dirname, '../index.html'), // 备用路径
      join(process.resourcesPath || __dirname, 'index.html'), // 打包后的资源路径
      join(process.resourcesPath || __dirname, '../index.html'), // 打包后的备用路径
    ];
    
    // 找到第一个存在的路径
    const foundPath = possiblePaths.find((path) => existsSync(path));
    const indexPath = foundPath || possiblePaths[0] || join(__dirname, 'index.html');
    
    console.log(`[Electron] Loading production build`);
    console.log(`[Electron] __dirname: ${__dirname}`);
    console.log(`[Electron] process.resourcesPath: ${process.resourcesPath || 'undefined'}`);
    console.log(`[Electron] indexPath: ${indexPath}`);
    console.log(`[Electron] File exists: ${existsSync(indexPath)}`);
    
    // 列出所有尝试的路径
    console.log(`[Electron] Tried paths:`, possiblePaths.map((p) => ({ path: p, exists: existsSync(p) })));

    // 列出目录内容以便调试
    if (isDebugMode) {
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

    // 检查文件是否存在并加载
    if (existsSync(indexPath)) {
      void mainWindow.loadFile(indexPath).catch((err) => {
        console.error('[Electron] Failed to load index.html:', err);
        handleLoadError(mainWindow, err, indexPath);
      });
    } else {
      console.error('[Electron] index.html not found in any of the tried paths!');
      console.error(`[Electron] Tried paths:`, possiblePaths);
      if (mainWindow) {
        mainWindow.show();
        // 显示错误信息
        if (isDebugMode) {
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
      }
    }

    // 在调试模式下打开开发者工具（延迟打开以确保窗口已创建）
    if (isDebugMode) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.openDevTools();
        }
      }, 500);
    }
  }

  // 监听页面加载完成事件
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Page loaded successfully');
    // 检查页面内容
    if (mainWindow) {
      void mainWindow.webContents.executeJavaScript(`
        console.log('[Page] Document ready state:', document.readyState);
        console.log('[Page] App element exists:', !!document.getElementById('q-app'));
        console.log('[Page] Scripts loaded:', Array.from(document.scripts).map(s => s.src));
        console.log('[Page] Stylesheets loaded:', Array.from(document.styleSheets).length);
      `);
      mainWindow.show();
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

// IPC handler for electron-fetch using Puppeteer (Stealth)
ipcMain.handle(
  'electron-fetch',
  async (
    _event,
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ) => {
    let window: BrowserWindow | null = null;
    try {
      console.log(`[Electron Fetch] Launching Puppeteer for ${url}`);

      if (!browserPromise) {
        // Connect to the Electron app
        // Note: pie.connect returns a Browser instance that controls the Electron app
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        browserPromise = pie.connect(app, puppeteer as any);

        // Handle connection failures: reset browserPromise if it rejects
        browserPromise.catch((error) => {
          console.error('[Electron Fetch] Browser connection failed:', error);
          browserPromise = null; // Reset to allow retry on next call
        });
      }
      const browser = await browserPromise;

      // Create a hidden window for scraping
      window = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // 禁用 webSecurity 以允许爬虫服务绕过 CORS 限制
          webSecurity: false,
        },
      });

      const page = await pie.getPage(browser, window);

      // Set timeout
      const timeoutMs = options?.timeout || 60000;
      page.setDefaultNavigationTimeout(timeoutMs);

      // Setup request headers if needed
      if (options?.headers) {
        await page.setExtraHTTPHeaders(options.headers);
      }

      console.log(`[Electron Fetch] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait for content (Cloudflare check handled by Stealth Plugin mostly, but we can add a small wait)
      await new Promise((r) => setTimeout(r, 2000));

      const content = await page.content();
      const title = await page.title();
      console.log(`[Electron Fetch] Page loaded: ${title}`);

      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: content,
      };

      window.close();
      return response;
    } catch (err) {
      console.error('[Electron Fetch] Puppeteer error:', err);

      // If the error is related to browser connection, reset browserPromise to allow retry
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (
        errorMessage.includes('connect') ||
        errorMessage.includes('browser') ||
        errorMessage.includes('disconnected') ||
        errorMessage.includes('target closed')
      ) {
        console.log('[Electron Fetch] Resetting browserPromise due to connection error');
        browserPromise = null;
      }

      if (window && !window.isDestroyed()) {
        window.close();
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
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
