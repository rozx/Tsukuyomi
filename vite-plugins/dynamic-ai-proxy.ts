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
      server.middlewares.use('/api/ai', (req, res, next) => {
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

            // 创建动态代理中间件
            const proxy = createProxyMiddleware({
              target: targetUrl,
              changeOrigin: true,
              secure: true,
              // 不需要 pathRewrite，因为我们已经修改了 req.url
              on: {
                proxyReq: (proxyReq, req, res) => {
                  // 保留原始请求头，特别是 Authorization
                  // 移除可能暴露代理的头部
                  proxyReq.removeHeader('x-forwarded-for');
                  proxyReq.removeHeader('x-forwarded-host');
                  proxyReq.removeHeader('x-forwarded-proto');
                },
                error: (err, req, res) => {
                  if (res && 'headersSent' in res && !res.headersSent) {
                    (res as ServerResponse).statusCode = 500;
                    (res as ServerResponse).end(`Proxy error: ${err.message}`);
                  }
                },
              },
            });

            // 使用代理中间件处理请求
            // 注意：createProxyMiddleware 返回的是一个中间件函数
            try {
              proxy(req, res, next);
              return; // 重要：确保不会继续执行后面的代码
            } catch (error) {
              if (res && 'headersSent' in res && !res.headersSent) {
                (res as ServerResponse).statusCode = 500;
                (res as ServerResponse).end(`Proxy middleware error: ${error instanceof Error ? error.message : String(error)}`);
              }
              return;
            }
          }
        }

        // 如果没有匹配，返回 404
        if (res && 'statusCode' in res) {
          (res as ServerResponse).statusCode = 404;
          (res as ServerResponse).end('Invalid proxy path format. Expected: /api/ai/{hostname}/...');
        }
      });
    },
  };
}

