import { app, BrowserWindow, ipcMain, net, Menu, shell, dialog } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 保持对窗口对象的全局引用，否则窗口会被自动关闭
let mainWindow: BrowserWindow | null = null;

// 检测是否为开发环境
const isDev = process.env.DEV === 'true' || process.env.NODE_ENV !== 'production';
// 调试模式：通过环境变量控制是否打开开发者工具（用于调试构建）
const isDebugMode = process.env.ELECTRON_DEBUG === 'true' || isDev;

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
    (window.loadURL(fileUrl) as Promise<void>).catch((urlErr) => {
      console.error('[Electron] Failed to load via URL:', urlErr);
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff', // 设置背景色以减少白屏闪烁
    show: false, // 先不显示窗口，等内容加载完成后再显示
    webPreferences: {
      preload: join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 在开发环境中禁用 webSecurity 以绕过 CORS 限制
      webSecurity: !isDev,
    },
  });

  // 开发环境加载开发服务器，生产环境加载构建后的文件
  if (isDev) {
    const devUrl = 'http://localhost:9000';
    console.log(`[Electron] Loading dev server: ${devUrl}`);
    // 使用 Promise 处理，但通过类型断言确保类型正确
    (mainWindow.loadURL(devUrl) as Promise<void>).catch((err) => {
      console.error('[Electron] Failed to load dev server:', err);
      console.error('[Electron] Make sure Vite dev server is running on port 9000');
      // 如果开发服务器不可用，尝试加载生产构建
      if (mainWindow) {
        const indexPath = join(__dirname, '../index.html');
        console.log(`[Electron] Falling back to: ${indexPath}`);
        (mainWindow.loadFile(indexPath) as Promise<void>).catch((fileErr) => {
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
    const indexPath = join(__dirname, 'index.html');
    console.log(`[Electron] Loading production build`);
    console.log(`[Electron] __dirname: ${__dirname}`);
    console.log(`[Electron] indexPath: ${indexPath}`);
    console.log(`[Electron] File exists: ${existsSync(indexPath)}`);

    // 列出目录内容以便调试
    if (isDebugMode) {
      try {
        const files = readdirSync(__dirname);
        console.log(`[Electron] Files in __dirname:`, files.slice(0, 10));
      } catch (e) {
        console.error('[Electron] Failed to read directory:', e);
      }
    }

    // 检查文件是否存在，如果不存在尝试其他路径
    if (!existsSync(indexPath)) {
      const altPath = join(__dirname, '../index.html');
      console.log(`[Electron] Trying alternative path: ${altPath}`);
      console.log(`[Electron] Alternative exists: ${existsSync(altPath)}`);
      if (existsSync(altPath)) {
        const finalPath = altPath;
        (mainWindow.loadFile(finalPath) as Promise<void>).catch((err) => {
          console.error('[Electron] Failed to load index.html:', err);
          handleLoadError(mainWindow, err, finalPath);
        });
      } else {
        console.error('[Electron] index.html not found in both locations!');
        console.error(`[Electron] Tried: ${indexPath}`);
        console.error(`[Electron] Tried: ${altPath}`);
        if (mainWindow) {
          mainWindow.show();
          // 显示错误信息
          if (isDebugMode) {
            void mainWindow.webContents.executeJavaScript(`
              document.body.innerHTML = '<div style="padding: 20px; font-family: monospace; color: red;">
                <h1>File Not Found</h1>
                <p>index.html not found in:</p>
                <ul>
                  <li>${indexPath}</li>
                  <li>${altPath}</li>
                </ul>
                <p>Check console for more details.</p>
              </div>';
            `);
          }
        }
      }
    } else {
      // 使用类型断言确保类型正确
      (mainWindow.loadFile(indexPath) as Promise<void>).catch((err) => {
        console.error('[Electron] Failed to load index.html:', err);
        handleLoadError(mainWindow, err, indexPath);
      });
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
                defaultPath: `luna-ai-settings-${new Date().toISOString().split('T')[0]}.json`,
                filters: [
                  { name: 'JSON Files', extensions: ['json'] },
                  { name: 'All Files', extensions: ['*'] },
                ],
              });

              if (!result.canceled && result.filePath) {
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
                    // 发送内容到渲染进程处理
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
    // 编辑菜单
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
              { type: 'separator' as const },
              {
                label: '语音',
                submenu: [{ role: 'startSpeaking' as const }, { role: 'stopSpeaking' as const }],
              },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ],
    },
    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    // 窗口菜单
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '了解更多',
          click: () => {
            void shell.openExternal('https://github.com/rozx/luna-ai-translator');
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

// IPC handler for electron-fetch
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
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: options?.method || 'GET',
        url,
      });

      // 设置超时
      const timeout = options?.timeout || 60000;
      const timeoutId = setTimeout(() => {
        request.abort();
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // 设置请求头
      if (options?.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          request.setHeader(key, value);
        });
      }

      // 设置默认请求头（如果未提供）
      if (!request.getHeader('User-Agent')) {
        request.setHeader(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );
      }
      if (!request.getHeader('Accept')) {
        request.setHeader(
          'Accept',
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        );
      }
      if (!request.getHeader('Accept-Language')) {
        request.setHeader('Accept-Language', 'ja,en-US;q=0.9,en;q=0.8');
      }
      if (!request.getHeader('Accept-Encoding')) {
        request.setHeader('Accept-Encoding', 'gzip, deflate, br');
      }

      // 处理响应
      request.on('response', (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        response.on('end', () => {
          clearTimeout(timeoutId);
          const buffer = Buffer.concat(chunks);

          // 处理响应编码
          let data: string;
          const encoding = response.headers['content-encoding'];

          if (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br') {
            // 让 axios 在 BaseScraper 中处理解压缩
            data = buffer.toString('utf-8');
          } else {
            data = buffer.toString('utf-8');
          }

          // 提取响应头
          const responseHeaders: Record<string, string> = {};
          Object.entries(response.headers).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              responseHeaders[key] = value.join(', ');
            } else if (value !== undefined) {
              responseHeaders[key] = String(value);
            }
          });

          resolve({
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers: responseHeaders,
            data,
          });
        });

        response.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });

      request.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      // 发送请求体（如果有）
      if (options?.body) {
        request.write(options.body);
      }

      request.end();
    });
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
        detail: `文件已保存到:\n${filePath}`,
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
    applicationName: 'Luna AI Translator',
    applicationVersion: app.getVersion(),
    version: `Version ${app.getVersion()}`,
    copyright: '© 2025 rozx',
    credits: 'Built with Electron, Quasar, and Vue 3',
    website: 'https://github.com/rozx/luna-ai-translator',
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
