import { createProxyMiddleware } from 'http-proxy-middleware';
import express, { type Request, type Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ClientRequest } from 'http';
import type { Socket } from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// DigitalOcean App Platform 会自动设置 PORT 环境变量
// 如果没有设置，默认使用 8080
const PORT = Number(process.env.PORT) || 8080;
// DigitalOcean 会自动设置 NODE_ENV=production
const isProduction = process.env.NODE_ENV === 'production';

// 注意：由于前端和后端都在同一个服务器上运行，不需要启用 CORS

// 代理配置类型
interface ProxyConfig {
  path: string;
  target: string;
  changeOrigin: boolean;
  pathRewrite: Record<string, string>;
  headers?: Record<string, string>;
}

// 代理配置 - 与 quasar.config.ts 中的配置保持一致
const proxyConfigs: ProxyConfig[] = [
  {
    path: '/api/sda1',
    target: 'https://p.sda1.dev',
    changeOrigin: true,
    pathRewrite: { '^/api/sda1': '' },
  },
  {
    path: '/api/syosetu',
    target: 'https://syosetu.org',
    changeOrigin: true,
    pathRewrite: { '^/api/syosetu': '' },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://syosetu.org/',
      Origin: 'https://syosetu.org',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  },
  {
    path: '/api/kakuyomu',
    target: 'https://kakuyomu.jp',
    changeOrigin: true,
    pathRewrite: { '^/api/kakuyomu': '' },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://kakuyomu.jp/',
      Origin: 'https://kakuyomu.jp',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  },
  {
    path: '/api/ncode',
    target: 'https://ncode.syosetu.com',
    changeOrigin: true,
    pathRewrite: { '^/api/ncode': '' },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://ncode.syosetu.com/',
      Origin: 'https://ncode.syosetu.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  },
  {
    path: '/api/novel18',
    target: 'https://novel18.syosetu.com',
    changeOrigin: true,
    pathRewrite: { '^/api/novel18': '' },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://novel18.syosetu.com/',
      Origin: 'https://novel18.syosetu.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  },
  {
    path: '/api/search',
    target: 'https://html.duckduckgo.com',
    changeOrigin: true,
    pathRewrite: { '^/api/search': '/html' },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://duckduckgo.com/',
      Origin: 'https://duckduckgo.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  },
];

// 为每个代理路径创建代理中间件
proxyConfigs.forEach((config) => {
  const { path, headers, ...proxyOptions } = config;
  const proxyMiddlewareOptions = {
    target: proxyOptions.target,
    changeOrigin: proxyOptions.changeOrigin,
    pathRewrite: proxyOptions.pathRewrite,
    // 设置超时时间为 60 秒（比前端的 30 秒更长，确保有足够时间处理）
    timeout: 60000,
    // 设置代理请求超时
    proxyTimeout: 60000,
    on: {
      proxyReq: (
        proxyReq: ClientRequest,
        req: IncomingMessage,
        _res: ServerResponse<IncomingMessage>,
      ) => {
        const expressReq = req as unknown as Request;
        const startTime = Date.now();
        const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // 存储请求开始时间到请求对象，以便在响应时计算耗时
        (req as any).proxyStartTime = startTime;
        (req as any).proxyRequestId = requestId;
        
        // 记录请求开始
        const targetUrl = `${proxyOptions.target}${expressReq.path}${expressReq.url?.split('?')[1] ? '?' + expressReq.url.split('?')[1] : ''}`;
        console.log(`[Proxy Request Start] [${requestId}] ${expressReq.method} ${expressReq.path} -> ${targetUrl}`, {
          originalUrl: expressReq.url,
          target: proxyOptions.target,
          timestamp: new Date().toISOString(),
        });

        // 设置自定义请求头
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            proxyReq.setHeader(key, value);
          });
        }
        // 移除可能暴露代理的头部
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('x-forwarded-host');
        proxyReq.removeHeader('x-forwarded-proto');
      },
      proxyRes: (
        proxyRes: IncomingMessage,
        req: IncomingMessage,
        res: ServerResponse<IncomingMessage>,
      ) => {
        const expressReq = req as unknown as Request;
        const startTime = (req as any).proxyStartTime;
        const requestId = (req as any).proxyRequestId || 'unknown';
        const duration = startTime ? Date.now() - startTime : 0;
        
        // 记录成功响应
        console.log(`[Proxy Response] [${requestId}] ${expressReq.method} ${expressReq.path} -> ${proxyRes.statusCode}`, {
          statusCode: proxyRes.statusCode,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });
      },
      error: (err: Error, req: IncomingMessage, res: ServerResponse<IncomingMessage> | Socket) => {
        const expressReq = req as unknown as Request;
        const startTime = (req as any).proxyStartTime;
        const requestId = (req as any).proxyRequestId || 'unknown';
        const duration = startTime ? Date.now() - startTime : 0;
        
        // 检查是否是超时错误
        const isTimeout = err.message.includes('timeout') || err.message.includes('ETIMEDOUT') || err.message.includes('ECONNRESET');
        const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';
        
        // 详细错误日志
        console.error(`[Proxy ${errorType}] [${requestId}] ${expressReq.method} ${expressReq.path}`, {
          error: err.message,
          errorCode: (err as any).code,
          errorStack: err.stack,
          duration: `${duration}ms`,
          target: proxyOptions.target,
          originalUrl: expressReq.url,
          timestamp: new Date().toISOString(),
        });
        
        // 只有当 res 是 ServerResponse 时才发送响应
        if (res && 'status' in res && 'headersSent' in res) {
          const expressRes = res as unknown as Response;
          if (!expressRes.headersSent) {
            expressRes.status(isTimeout ? 504 : 500).json({
              error: isTimeout ? '代理请求超时' : '代理请求失败',
              message: err.message,
              requestId,
              duration: `${duration}ms`,
            });
          }
        }
      },
    },
  };

  app.use(path, createProxyMiddleware(proxyMiddlewareOptions));
});

// Vite 开发服务器端口（在开发环境中使用）
const VITE_DEV_PORT = Number(process.env.VITE_PORT) || 9000;

if (isProduction) {
  // 生产环境：提供静态文件服务
  const distPath = join(__dirname, '../dist/spa');
  if (existsSync(distPath)) {
    // 提供静态文件
    app.use(express.static(distPath));

    // History 路由支持：所有非 API 路由都返回 index.html
    app.get('*', (req, res, next) => {
      // 跳过 API 路由
      if (req.path.startsWith('/api')) {
        return next();
      }
      // 跳过静态资源
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        return next();
      }
      // 返回 index.html
      const indexPath = join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        const html = readFileSync(indexPath, 'utf-8');
        res.send(html);
      } else {
        res.status(404).send('Not found');
      }
    });
  } else {
    console.warn(`警告: 未找到构建目录 ${distPath}，仅提供 API 代理服务`);
  }
} else {
  // 开发环境：代理到 Vite 开发服务器
  const viteTarget = `http://localhost:${VITE_DEV_PORT}`;

  // 代理所有非 API 请求到 Vite 开发服务器
  const viteProxy = createProxyMiddleware({
    target: viteTarget,
    changeOrigin: true,
    ws: true, // 支持 WebSocket（用于 HMR）
    on: {
      error: (err: Error, req: IncomingMessage, res: ServerResponse<IncomingMessage> | Socket) => {
        // 如果 Vite 开发服务器未启动，返回提示信息
        if ((err as { code?: string }).code === 'ECONNREFUSED') {
          // 只有当 res 是 ServerResponse 时才发送响应
          if (res && 'status' in res && 'headersSent' in res) {
            const response = res as unknown as Response;
            if (!response.headersSent) {
              response.status(503).send(`
                <html>
                  <head><title>Vite Dev Server Not Running</title></head>
                  <body>
                    <h1>Vite 开发服务器未运行</h1>
                    <p>请确保 Vite 开发服务器正在 ${viteTarget} 上运行。</p>
                    <p>Vite 开发服务器应该会自动启动。如果未启动，请检查控制台输出。</p>
                  </body>
                </html>
              `);
            }
          }
        } else {
          // 只有当 res 是 ServerResponse 时才发送响应
          if (res && 'status' in res && 'headersSent' in res) {
            const response = res as unknown as Response;
            if (!response.headersSent) {
              response.status(500).send('代理错误: ' + err.message);
            }
          }
          console.error('[Vite Proxy Error]', err.message);
        }
      },
    },
  });

  // 代理所有非 API 路由到 Vite
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    viteProxy(req, res, next);
  });

  console.log(`开发模式: 代理到 Vite 开发服务器 ${viteTarget}`);
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'luna-ai-translator',
    mode: isProduction ? 'production' : 'development',
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Luna AI Translator 服务器运行在端口 ${PORT}`);
  console.log(`模式: ${isProduction ? '生产' : '开发'}`);
  if (isProduction) {
    console.log('已配置的代理路径:');
    proxyConfigs.forEach((config) => {
      console.log(`  - ${config.path} -> ${config.target}`);
    });
  }
});
