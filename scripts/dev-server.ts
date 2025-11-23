#!/usr/bin/env bun
/**
 * 开发服务器启动脚本
 * 同时启动 Vite 开发服务器和 Node.js 应用服务器
 */

import { $ } from 'bun';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Vite 开发服务器端口
const VITE_PORT = process.env.VITE_PORT || '9000';
// Node.js 应用服务器端口
const APP_PORT = process.env.PORT || '8080';

console.log('🚀 启动开发服务器...');
console.log(`  - Vite 开发服务器: http://localhost:${VITE_PORT}`);
console.log(`  - Node.js 应用服务器: http://localhost:${APP_PORT}`);
console.log(`  - 访问应用: http://localhost:${APP_PORT}`);
console.log('');

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

// 启动 Node.js 应用服务器
const appProcess = Bun.spawn(['bun', 'run', 'server/app-server.ts'], {
  cwd: projectRoot,
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
});

// 处理进程退出
const cleanup = async () => {
  console.log('\n🛑 正在停止开发服务器...');
  viteProcess.kill();
  appProcess.kill();
  await Promise.all([
    viteProcess.exited,
    appProcess.exited,
  ]);
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 处理进程错误
viteProcess.exited.catch((err) => {
  console.error('❌ Vite 开发服务器异常退出:', err);
  cleanup();
});

appProcess.exited.catch((err) => {
  console.error('❌ Node.js 应用服务器异常退出:', err);
  cleanup();
});

// 等待任一进程退出
await Promise.race([
  viteProcess.exited,
  appProcess.exited,
]);

// 如果任一进程退出，清理并退出
await cleanup();

