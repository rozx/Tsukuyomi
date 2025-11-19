import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 保持对窗口对象的全局引用，否则窗口会被自动关闭
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // preload: join(__dirname, 'electron-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 在开发环境中禁用 webSecurity 以绕过 CORS 限制
      // 注意：这仅用于开发环境，生产环境应保持 webSecurity 为 true
      // 检查是否为开发环境（Quasar 开发模式）
      webSecurity: process.env.NODE_ENV === 'production',
    },
  });

  // 开发环境加载开发服务器，生产环境加载构建后的文件
  if (process.env.DEV) {
    void mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(join(__dirname, '../index.html'));
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
