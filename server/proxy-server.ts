import { createProxyMiddleware } from 'http-proxy-middleware';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { IncomingMessage, ServerResponse } from 'http';
import type { ClientRequest } from 'http';
import type { Socket } from 'net';

const app = express();
const PORT = process.env.PORT || 8080;

// 启用 CORS
app.use(cors());

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
    on: {
      proxyReq: (
        proxyReq: ClientRequest,
        _req: IncomingMessage,
        _res: ServerResponse<IncomingMessage>,
      ) => {
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
      error: (err: Error, req: IncomingMessage, res: ServerResponse<IncomingMessage> | Socket) => {
        const expressReq = req as unknown as Request;
        console.error(`[Proxy Error] ${expressReq.path || req.url}:`, err.message);
        // 只有当 res 是 ServerResponse 时才发送响应
        if (res && 'status' in res && 'headersSent' in res) {
          const expressRes = res as unknown as Response;
          if (!expressRes.headersSent) {
            expressRes.status(500).json({
              error: '代理请求失败',
              message: err.message,
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
