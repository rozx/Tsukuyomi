#!/usr/bin/env bun
/**
 * 开发服务器启动脚本
 * 同时启动 Vite 开发服务器和 Node.js 应用服务器
 * 支持文件监听，自动重启应用服务器
 */

import { $ } from 'bun';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { watch } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const serverDir = join(projectRoot, 'server');

// Vite 开发服务器端口
const VITE_PORT = process.env.VITE_PORT || '9000';
// Node.js 应用服务器端口
const APP_PORT = process.env.PORT || '8080';

// 检查并释放端口的函数
const checkAndFreePort = async (port: string | number) => {
  try {
    const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
    // 查找占用端口的进程
    const result = execSync(`lsof -ti:${portNum}`, { encoding: 'utf-8' }).trim();
    
    if (result) {
      const pids = result.split('\n').filter((pid) => pid.trim());
      if (pids.length > 0) {
        console.log(`⚠️  检测到端口 ${portNum} 被占用，正在终止占用进程...`);
        pids.forEach((pid) => {
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            console.log(`   ✓ 已终止进程 ${pid}`);
          } catch (err) {
            // 忽略错误，进程可能已经退出
          }
        });
        // 等待一下，确保端口释放
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(`   ✓ 端口 ${portNum} 已释放\n`);
      }
    }
  } catch (err) {
    // lsof 没有找到占用端口的进程，这是正常的
    // 忽略错误
  }
};

console.log('🚀 启动开发服务器...');
console.log(`  - Vite 开发服务器: http://localhost:${VITE_PORT}`);
console.log(`  - Node.js 应用服务器: http://localhost:${APP_PORT}`);
console.log(`  - 访问应用: http://localhost:${APP_PORT}`);
console.log(`  - 文件监听: 已启用（server/ 目录）`);
console.log('');

// 检查并释放端口
await checkAndFreePort(VITE_PORT);
await checkAndFreePort(APP_PORT);

// 设置环境变量
process.env.VITE_PORT = VITE_PORT;
process.env.PORT = APP_PORT;
process.env.NODE_ENV = 'development';

// 启动 Vite 开发服务器（后台运行）
const viteProcess = Bun.spawn(['bun', 'run', 'dev:vite'], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
});

// 等待 Vite 服务器启动（给一点时间）
await new Promise((resolve) => setTimeout(resolve, 3000));

// 应用服务器进程引用
let appProcess: ReturnType<typeof Bun.spawn> | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

// 启动应用服务器的函数
const startAppServer = async () => {
  // 如果已有进程，先停止
  if (appProcess) {
    console.log('🛑 停止应用服务器...');
    appProcess.kill();
    try {
      await appProcess.exited;
    } catch {
      // 忽略错误，继续执行
    }
    appProcess = null;
  }

  console.log('▶️  启动应用服务器...');
  appProcess = Bun.spawn(['bun', 'run', 'server/app-server.ts'], {
    cwd: projectRoot,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });

  appProcess.exited.catch((err) => {
    console.error('❌ Node.js 应用服务器异常退出:', err);
    // 如果不是手动杀死，尝试重启
    if (appProcess && !appProcess.killed) {
      setTimeout(() => startAppServer(), 1000);
    }
  });
};

// 启动应用服务器
await startAppServer();

// 防抖重启函数
const restartAppServer = () => {
  // 清除之前的定时器
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  
  // 延迟重启，避免频繁重启（500ms 防抖）
  restartTimer = setTimeout(async () => {
    console.log('🔄 正在重启应用服务器...');
    await startAppServer();
    restartTimer = null;
  }, 500);
};

// 监听服务器文件变化（使用 Node.js fs.watch）
const watcher = watch(serverDir, { recursive: true }, (eventType, filename) => {
  // 忽略临时文件和隐藏文件
  if (!filename || filename.includes('node_modules') || filename.startsWith('.')) {
    return;
  }
  
  // 只处理文件变化事件
  if (eventType === 'change') {
    console.log(`\n📝 检测到文件变化: ${filename}`);
    restartAppServer();
  }
});

// 处理进程退出
const cleanup = async () => {
  console.log('\n🛑 正在停止开发服务器...');
  watcher.close();
  
  // 清除重启定时器
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  
  // 优雅地停止进程
  try {
    viteProcess.kill('SIGTERM');
    if (appProcess) {
      appProcess.kill('SIGTERM');
    }
    
    // 等待进程退出，设置超时
    const exitPromises = [viteProcess.exited];
    if (appProcess) {
      exitPromises.push(appProcess.exited);
    }
    
    await Promise.race([
      Promise.all(exitPromises),
      new Promise((resolve) => setTimeout(resolve, 2000)), // 2秒超时
    ]);
    
    // 如果进程还在运行，强制终止
    if (!viteProcess.killed) {
      viteProcess.kill('SIGKILL');
    }
    if (appProcess && !appProcess.killed) {
      appProcess.kill('SIGKILL');
    }
  } catch (err) {
    // 忽略清理过程中的错误
  }
  
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 处理进程错误
viteProcess.exited.catch((err: any) => {
  // 退出代码 143 (SIGTERM) 是正常的，不需要报错
  if (err?.code !== 143 && err?.signal !== 'SIGTERM') {
    console.error('❌ Vite 开发服务器异常退出:', err);
  }
  // 只有在非正常退出时才清理
  if (err?.code !== 143 && err?.signal !== 'SIGTERM') {
    cleanup();
  }
});

// 等待任一进程退出
await Promise.race([
  viteProcess.exited,
  appProcess ? appProcess.exited : Promise.resolve(),
]);

// 如果任一进程退出，清理并退出
await cleanup();

