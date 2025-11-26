import type { Plugin } from 'vite';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { ServerResponse } from 'http';

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
          return (req as any)._dynamicProxyTarget;
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
              (res).statusCode = 500;
              (res).end(`Proxy error: ${err.message}`);
            }
          },
        },
      });

      server.middlewares.use('/api/ai', (req, res, next) => {
        (async () => {
          const path = req.url || '';

          // 提取 hostname: /api/ai/{hostname}/... 或 /{hostname}/...（如果路径已经被部分处理）
          let match = path.match(/^\/api\/ai\/([^/]+)(\/.*)?$/);
          let hostname: string | undefined;
          let restPath: string | undefined;

          if (match && match[1]) {
            // 标准格式: /api/ai/{hostname}/...
            hostname = match[1].trim();
            restPath = match[2] || '/';
          } else {
            // 尝试匹配已经被部分处理的路径: /{hostname}/...
            // 这种情况可能发生在路径已经被重写后
            match = path.match(/^\/([^/]+)(\/.*)?$/);
            if (match && match[1] && match[1].includes('.')) {
              hostname = match[1].trim();
              restPath = match[2] || '/';
            }
          }

          if (hostname && restPath !== undefined) {
            // 验证 hostname 格式
            if (hostname && hostname.includes('.')) {
              const targetUrl = `https://${hostname}`;

              // 修改请求路径，移除 /api/ai/{hostname} 或 /{hostname} 前缀
              let finalPath = restPath || '/';
              
              // 如果路径不包含 /v1，自动添加（OpenAI 兼容 API 通常需要 /v1 前缀）
              // 但只有在路径不是以 /v1 开头时才添加
              if (!finalPath.startsWith('/v1') && !finalPath.startsWith('/v1/')) {
                // 检查是否是 OpenAI SDK 的标准端点（如 /models, /chat/completions 等）
                // 这些端点通常需要 /v1 前缀
                if (finalPath.startsWith('/models') || 
                    finalPath.startsWith('/chat/completions') || 
                    finalPath.startsWith('/completions') ||
                    finalPath.startsWith('/embeddings') ||
                    finalPath.startsWith('/audio') ||
                    finalPath.startsWith('/files') ||
                    finalPath.startsWith('/fine-tunes') ||
                    finalPath.startsWith('/moderations')) {
                  finalPath = `/v1${finalPath}`;
                }
              }
              
              req.url = finalPath;
              // 设置动态代理目标供 router 使用
              (req as any)._dynamicProxyTarget = targetUrl;

              // 使用共享的代理中间件
              try {
                await proxy(req, res, next);
                return;
              } catch (error) {
                if (res && 'headersSent' in res && !res.headersSent) {
                  (res).statusCode = 500;
                  (res).end(`Proxy middleware error: ${error instanceof Error ? error.message : String(error)}`);
                }
                return;
              }
            }
          }

          // 如果没有匹配，返回 404
          if (res && 'statusCode' in res) {
            (res).statusCode = 404;
            (res).end('Invalid proxy path format. Expected: /api/ai/{hostname}/...');
          }
        })().catch((err) => {
          console.error('Proxy middleware error:', err);
          if (res && 'headersSent' in res && !res.headersSent) {
            (res).statusCode = 500;
            (res).end('Internal Server Error');
          }
        });
      });
    },
  };
}
