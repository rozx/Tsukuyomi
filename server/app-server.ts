import express, { type Request, type Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { Impit } from 'impit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === 'production';

// --- Configuration ---

interface TargetConfig {
  baseUrl: string;
  mode: 'direct' | 'allorigins';
}

// Define your targets here
const TARGETS: Record<string, TargetConfig> = {
  '/api/sda1': { baseUrl: 'https://p.sda1.dev', mode: 'direct' },
  '/api/kakuyomu': { baseUrl: 'https://kakuyomu.jp', mode: 'direct' },
  '/api/ncode': { baseUrl: 'https://ncode.syosetu.com', mode: 'direct' },
  '/api/novel18': { baseUrl: 'https://novel18.syosetu.com', mode: 'direct' },
  // syosetu.org often requires JS/Cookies (Cloudflare), so we use AllOrigins to bypass
  '/api/syosetu': { baseUrl: 'https://syosetu.org', mode: 'allorigins' },
  '/api/search': { baseUrl: 'https://html.duckduckgo.com/html', mode: 'direct' },
};

// --- Proxy Handlers ---

// Create a shared Impit instance
const impit = new Impit({
  browser: 'chrome',
});

const handleDirectProxy = async (
  req: Request,
  res: Response,
  targetUrl: string,
  requestId: string,
) => {
  const response = await impit.fetch(targetUrl, {
    method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
    body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
  });

  res.status(response.status);

  const headersToSkip = [
    'content-encoding',
    'transfer-encoding',
    'connection',
    'set-cookie',
    'content-security-policy',
    'x-frame-options',
    'content-length',
  ];

  response.headers.forEach((value, key) => {
    if (!headersToSkip.includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  const body = await response.arrayBuffer();
  res.send(Buffer.from(body));
  console.log(`[Proxy Direct] [${requestId}] Completed`);
};

const handleAllOriginsProxy = async (
  req: Request,
  res: Response,
  targetUrl: string,
  requestId: string,
) => {
  // AllOrigins API format: https://api.allorigins.win/get?url=...
  const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
  console.log(`[Proxy AllOrigins] [${requestId}] Fetching via ${allOriginsUrl}`);

  try {
    const response = await impit.fetch(allOriginsUrl);
    const text = await response.text();

    let data: { status?: { http_code?: number }; contents?: string };
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(`[Proxy AllOrigins] [${requestId}] JSON Parse Error: ${(e as Error).message}`);
      console.error(
        `[Proxy AllOrigins] [${requestId}] Response length: ${text.length}. End of response: ${text.slice(
          -100,
        )}`,
      );
      // If JSON parsing fails, it might be because AllOrigins failed or returned raw content?
      // Or maybe we can fallback to direct proxy?
      console.log(`[Proxy AllOrigins] [${requestId}] Falling back to Direct Proxy...`);
      await handleDirectProxy(req, res, targetUrl, requestId);
      return;
    }

    if (data.status?.http_code) {
      res.status(data.status.http_code);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // AllOrigins returns the HTML content in the 'contents' field
      res.send(data.contents);
      console.log(`[Proxy AllOrigins] [${requestId}] Completed (Status: ${data.status.http_code})`);
    } else {
      throw new Error(
        `AllOrigins returned invalid data: ${JSON.stringify(data).substring(0, 100)}`,
      );
    }
  } catch (error) {
    console.error(`[Proxy AllOrigins] [${requestId}] Error: ${(error as Error).message}`);
    console.log(`[Proxy AllOrigins] [${requestId}] Falling back to Direct Proxy...`);
    await handleDirectProxy(req, res, targetUrl, requestId);
  }
};

const handleProxyRequest = async (
  req: Request,
  res: Response,
  config: TargetConfig,
  pathPrefix: string,
) => {
  const pathPart = req.path.replace(pathPrefix, '');
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const targetUrl = `${config.baseUrl}${pathPart}${queryString}`;
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  console.log(
    `[Proxy] [${requestId}] ${req.method} ${req.path} -> ${targetUrl} (Mode: ${config.mode})`,
  );

  try {
    if (config.mode === 'allorigins') {
      await handleAllOriginsProxy(req, res, targetUrl, requestId);
    } else {
      await handleDirectProxy(req, res, targetUrl, requestId);
    }
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && 'code' in error && error.code === 'ETIMEDOUT';
    const message = error instanceof Error ? error.message : 'Unknown error';
    const code =
      error instanceof Error && 'code' in error ? (error as { code: string }).code : undefined;
    console.error(`[Proxy Error] [${requestId}] ${message}`);

    if (!res.headersSent) {
      res.status(isTimeout ? 504 : 500).json({
        error: 'Proxy Request Failed',
        mode: config.mode,
        message,
        code,
      });
    }
  }
};

// --- Register API Routes ---

Object.entries(TARGETS).forEach(([pathPrefix, config]) => {
  app.use(pathPrefix, (req, res) => {
    void handleProxyRequest(req, res, config, pathPrefix);
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: isProduction ? 'production' : 'development' });
});

// --- Static Files & Frontend Serving ---

const VITE_DEV_PORT = Number(process.env.VITE_PORT) || 9000;

if (isProduction) {
  const distPath = join(__dirname, '../dist/spa');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexPath = join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        res.send(readFileSync(indexPath, 'utf-8'));
      } else {
        res.status(404).send('Not found');
      }
    });
  } else {
    console.warn(`Warning: Dist directory ${distPath} not found.`);
  }
} else {
  void import('http-proxy-middleware')
    .then(({ createProxyMiddleware }) => {
      const viteTarget = `http://localhost:${VITE_DEV_PORT}`;
      const middleware = createProxyMiddleware({
        target: viteTarget,
        changeOrigin: true,
        ws: true,
      }) as express.RequestHandler;
      app.use(middleware);
      console.log(`Dev Mode: Proxying non-API requests to ${viteTarget}`);
    })
    .catch((err) => {
      console.error('Failed to start Vite proxy:', err);
    });
}

// --- Start Server ---

app.listen(PORT, () => {
  console.log(`Luna AI Translator Server running on port ${PORT}`);
  console.log(`Mode: ${isProduction ? 'Production' : 'Development'}`);
  console.log('Proxy Targets Configured (Mixed Mode: Direct + AllOrigins)');
});
