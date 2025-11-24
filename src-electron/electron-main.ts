import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';

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
      // preload: join(__dirname, 'electron-preload.js'),
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

void app.whenReady().then(() => {
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
