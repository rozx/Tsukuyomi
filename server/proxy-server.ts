import { createProxyMiddleware } from 'http-proxy-middleware';
import express, { type Request, type Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ClientRequest } from 'http';
import type { Socket } from 'net';

const app = express();
const PORT = process.env.PORT || 8080;

// 注意：在 Node.js/Bun 服务器模式下，不需要启用 CORS

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
  // 注意：syosetu 在 app-server.ts 中使用 AllOrigins API 处理，这里不再配置
  // {
  //   path: '/api/syosetu',
  //   target: 'https://syosetu.org',
  //   changeOrigin: true,
  //   pathRewrite: { '^/api/syosetu': '' },
  //   headers: {
  //     'User-Agent':
  //       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  //     Referer: 'https://syosetu.org/',
  //     Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  //     'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  //     'Accept-Encoding': 'gzip, deflate, br',
  //   },
  // },
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
        
        // 移除客户端可能发送的 Sec-Fetch-* 和 Client Hints 头部（AllOrigins 风格）
        // 这些头部是浏览器自动添加的，不应该从服务器端发送
        proxyReq.removeHeader('sec-fetch-dest');
        proxyReq.removeHeader('sec-fetch-mode');
        proxyReq.removeHeader('sec-fetch-site');
        proxyReq.removeHeader('sec-fetch-user');
        proxyReq.removeHeader('sec-ch-ua');
        proxyReq.removeHeader('sec-ch-ua-mobile');
        proxyReq.removeHeader('sec-ch-ua-platform');
        proxyReq.removeHeader('sec-ch-ua-arch');
        proxyReq.removeHeader('sec-ch-ua-bitness');
        proxyReq.removeHeader('sec-ch-ua-full-version');
        proxyReq.removeHeader('sec-ch-ua-full-version-list');
        proxyReq.removeHeader('sec-ch-ua-platform-version');
        proxyReq.removeHeader('sec-ch-ua-model');
        proxyReq.removeHeader('accept-ch');
        
        // 移除可能暴露代理的头部
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('x-forwarded-host');
        proxyReq.removeHeader('x-forwarded-proto');
        
        // 设置自定义请求头（AllOrigins 风格：只设置基本头部）
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            proxyReq.setHeader(key, value);
          });
        }
        
        // 记录请求详情（包括实际发送的请求头）
        const requestHeaders: Record<string, string> = {};
        proxyReq.getHeaders && Object.entries(proxyReq.getHeaders()).forEach(([key, value]) => {
          if (typeof value === 'string') {
            requestHeaders[key] = value;
          } else if (Array.isArray(value)) {
            requestHeaders[key] = value.join(', ');
          }
        });
        
        console.log(`[Proxy Request Start] [${requestId}] ${expressReq.method} ${expressReq.path} -> ${targetUrl}`, {
          originalUrl: expressReq.url,
          target: proxyOptions.target,
          requestHeaders: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
          timestamp: new Date().toISOString(),
        });
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
        
        // 提取响应头
        const responseHeaders: Record<string, string> = {};
        Object.keys(proxyRes.headers).forEach((key) => {
          const value = proxyRes.headers[key];
          if (typeof value === 'string') {
            responseHeaders[key] = value;
          } else if (Array.isArray(value)) {
            responseHeaders[key] = value.join(', ');
          }
        });
        
        // 对于错误状态码（4xx, 5xx），记录更详细的信息
        const statusCode = proxyRes.statusCode || 0;
        const isError = statusCode >= 400;
        
        if (isError) {
          console.error(`[Proxy Response Error] [${requestId}] ${expressReq.method} ${expressReq.path} -> ${statusCode}`, {
            statusCode,
            duration: `${duration}ms`,
            responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
            target: proxyOptions.target,
            originalUrl: expressReq.url,
            timestamp: new Date().toISOString(),
          });
        } else {
          // 记录成功响应
          console.log(`[Proxy Response] [${requestId}] ${expressReq.method} ${expressReq.path} -> ${statusCode}`, {
            statusCode,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
          });
        }
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

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'proxy-server' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`代理服务器运行在端口 ${PORT}`);
  console.log('已配置的代理路径:');
  proxyConfigs.forEach((config) => {
    console.log(`  - ${config.path} -> ${config.target}`);
  });
});
