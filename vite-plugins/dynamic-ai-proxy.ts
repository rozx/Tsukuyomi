import type { Plugin } from 'vite';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'http';

// 内联定义以避免声明 `connect` 依赖（运行期由 vite 传递带入 @types/connect）
type NextFunction = (err?: unknown) => void;

/**
 * 扩展的请求类型，包含动态代理目标
 */
interface ExtendedIncomingMessage extends IncomingMessage {
  _dynamicProxyTarget?: string;
}

const OPENAI_V1_ENDPOINTS = [
  '/models',
  '/chat/completions',
  '/completions',
  '/embeddings',
  '/audio',
  '/files',
  '/fine-tunes',
  '/moderations',
];

function parseHostnameAndRest(path: string): { hostname: string; restPath: string } | null {
  const standard = path.match(/^\/api\/ai\/([^/]+)(\/.*)?$/);
  if (standard && standard[1]) {
    return { hostname: standard[1].trim(), restPath: standard[2] || '/' };
  }
  const rewritten = path.match(/^\/([^/]+)(\/.*)?$/);
  if (rewritten && rewritten[1] && rewritten[1].includes('.')) {
    return { hostname: rewritten[1].trim(), restPath: rewritten[2] || '/' };
  }
  return null;
}

function ensureV1Prefix(finalPath: string): string {
  if (finalPath.startsWith('/v1') || finalPath.startsWith('/v1/')) return finalPath;
  if (OPENAI_V1_ENDPOINTS.some((endpoint) => finalPath.startsWith(endpoint))) {
    return `/v1${finalPath}`;
  }
  return finalPath;
}

async function handleAiProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: NextFunction,
  proxy: (
    req: IncomingMessage,
    res: ServerResponse,
    next: NextFunction,
  ) => Promise<void> | void,
): Promise<void> {
  const parsed = parseHostnameAndRest(req.url || '');
  if (!parsed || !parsed.hostname.includes('.')) {
    if (res && 'statusCode' in res) {
      res.statusCode = 404;
      res.end('Invalid proxy path format. Expected: /api/ai/{hostname}/...');
    }
    return;
  }

  const finalPath = ensureV1Prefix(parsed.restPath || '/');
  req.url = finalPath;
  (req as ExtendedIncomingMessage)._dynamicProxyTarget = `https://${parsed.hostname}`;

  try {
    await proxy(req, res, next);
  } catch (error) {
    if (res && 'headersSent' in res && !res.headersSent) {
      res.statusCode = 500;
      res.end(
        `Proxy middleware error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * 动态 AI API 代理插件
 * 根据路径中的 hostname 动态设置代理目标
 */
export function dynamicAIProxy(): Plugin {
  return {
    name: 'dynamic-ai-proxy',
    configureServer(server) {
      // 创建共享的代理中间件实例
      const proxy = createProxyMiddleware({
        target: 'http://localhost', // 默认目标，会被 router 覆盖
        changeOrigin: true,
        secure: true,
        router: (req) => {
          return (req as ExtendedIncomingMessage)._dynamicProxyTarget;
        },
        on: {
          proxyReq: (proxyReq, _req, _res) => {
            // 保留原始请求头，特别是 Authorization
            // 移除可能暴露代理的头部
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-host');
            proxyReq.removeHeader('x-forwarded-proto');
          },
          error: (err, _req, res) => {
            if (res && 'headersSent' in res && !res.headersSent) {
              res.statusCode = 500;
              res.end(`Proxy error: ${err.message}`);
            }
          },
        },
      });

      server.middlewares.use('/api/ai', (req, res, next) => {
        handleAiProxyRequest(req, res, next, proxy).catch((err) => {
          console.error('Proxy middleware error:', err);
          if (res && 'headersSent' in res && !res.headersSent) {
            res.statusCode = 500;
            res.end('Internal Server Error');
          }
        });
      });
    },
  };
}
