import express, { type Request, type Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { handlePuppeteerProxy } from './proxy/puppeteer-proxy';
import { handleDirectProxy, handleAllOriginsProxy } from './proxy/http-proxy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === 'production';
const PROXY_MODE = process.env.PROXY_MODE || 'allorigins'; // 'puppeteer' or 'allorigins'

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

// --- Proxy Handlers (imported from separate modules) ---

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
  const startTime = Date.now();

  // Determine the actual proxy method that will be used
  let actualProxyMethod: string;
  if (PROXY_MODE === 'puppeteer') {
    actualProxyMethod = 'puppeteer';
  } else {
    actualProxyMethod = config.mode; // 'direct' or 'allorigins'
  }

  console.log(
    `[Proxy] [${requestId}] ${req.method} ${req.path} -> ${targetUrl} (Using: ${actualProxyMethod})`,
  );

  // Immediately set headers to keep connection alive and prevent load balancer timeout
  // This is critical for DigitalOcean App Platform which may timeout after 5-10 seconds
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if present

  // Set response timeout to 120 seconds
  res.setTimeout(120000, () => {
    if (!res.headersSent) {
      const duration = Date.now() - startTime;
      console.error(
        `[Proxy Timeout] [${requestId}] Request timed out after ${duration}ms (120s limit)`,
      );
      res.status(504).json({
        error: 'Gateway Timeout',
        mode: config.mode,
        proxyMode: PROXY_MODE,
        message: 'Request timeout after 120 seconds',
        duration,
      });
    }
  });

  try {
    // Use Puppeteer only when PROXY_MODE='puppeteer'
    if (PROXY_MODE === 'puppeteer') {
      await handlePuppeteerProxy(req, res, targetUrl, requestId);
      const duration = Date.now() - startTime;
      console.log(`[Proxy] [${requestId}] Completed in ${duration}ms`);
      return;
    }

    // Otherwise, use the configured mode (direct or allorigins)
    if (config.mode === 'allorigins') {
      await handleAllOriginsProxy(req, res, targetUrl, requestId);
    } else {
      await handleDirectProxy(req, res, targetUrl, requestId);
    }
    const duration = Date.now() - startTime;
    console.log(`[Proxy] [${requestId}] Completed in ${duration}ms`);
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const isTimeout =
      error instanceof Error &&
      (error.message.includes('Timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('timeout') ||
        ('code' in error && (error as { code: string }).code === 'ETIMEDOUT'));
    const message = error instanceof Error ? error.message : 'Unknown error';
    const code =
      error instanceof Error && 'code' in error ? (error as { code: string }).code : undefined;
    console.error(`[Proxy Error] [${requestId}] ${message} (Duration: ${duration}ms)`);

    if (!res.headersSent) {
      res.status(isTimeout ? 504 : 500).json({
        error: 'Proxy Request Failed',
        mode: config.mode,
        proxyMode: PROXY_MODE,
        message,
        code,
        duration,
      });
    }
  }
};

// Generic Proxy Handler for arbitrary URLs
const handleGenericProxy = async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const startTime = Date.now();

  // Determine proxy method based on target URL
  // Only syosetu.org should use allorigins, others use direct
  let proxyMethod: 'puppeteer' | 'direct' | 'allorigins';
  if (PROXY_MODE === 'puppeteer') {
    proxyMethod = 'puppeteer';
  } else {
    try {
      const urlObj = new URL(url);
      // Only syosetu.org requires allorigins due to Cloudflare protection
      proxyMethod = urlObj.hostname === 'syosetu.org' ? 'allorigins' : 'direct';
    } catch {
      // If URL parsing fails, default to direct
      proxyMethod = 'direct';
    }
  }

  console.log(`[Proxy Generic] [${requestId}] Fetching ${url} (Using: ${proxyMethod})`);

  // Set response timeout to 120 seconds
  res.setTimeout(120000, () => {
    if (!res.headersSent) {
      const duration = Date.now() - startTime;
      console.error(
        `[Proxy Generic Timeout] [${requestId}] Request timed out after ${duration}ms (120s limit)`,
      );
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Request timeout after 120 seconds',
        duration,
      });
    }
  });

  try {
    if (proxyMethod === 'puppeteer') {
      await handlePuppeteerProxy(req, res, url, requestId);
    } else if (proxyMethod === 'allorigins') {
      await handleAllOriginsProxy(req, res, url, requestId);
    } else {
      await handleDirectProxy(req, res, url, requestId);
    }
    const duration = Date.now() - startTime;
    console.log(`[Proxy Generic] [${requestId}] Completed in ${duration}ms`);
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const isTimeout =
      error instanceof Error &&
      (error.message.includes('Timeout') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('timeout') ||
        ('code' in error && (error as { code: string }).code === 'ETIMEDOUT'));
    const message = error instanceof Error ? error.message : 'Unknown error';
    const code =
      error instanceof Error && 'code' in error ? (error as { code: string }).code : undefined;
    console.error(`[Proxy Generic Error] [${requestId}] ${message} (Duration: ${duration}ms)`);
    if (!res.headersSent) {
      res.status(isTimeout ? 504 : 500).json({
        error: 'Proxy Request Failed',
        message,
        code,
        duration,
      });
    }
  }
};

// --- Register API Routes ---

// Register generic proxy route
app.get('/api/proxy', (req, res) => {
  void handleGenericProxy(req, res);
});

Object.entries(TARGETS).forEach(([pathPrefix, config]) => {
  app.use(pathPrefix, (req, res) => {
    void handleProxyRequest(req, res, config, pathPrefix);
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: isProduction ? 'production' : 'development',
    proxyMode: PROXY_MODE,
  });
});

// --- Static Files & Frontend Serving ---

const VITE_DEV_PORT = Number(process.env.VITE_PORT) || 9000;

if (isProduction) {
  const distPath = join(__dirname, '../dist/spa');
  if (existsSync(distPath)) {
    // Serve static files (CSS, JS, images, etc.)
    // index: false prevents automatic index.html serving for root path
    app.use(express.static(distPath, { index: false }));

    // Catch-all handler: serve index.html for all non-API, non-static routes
    // This is required for Vue Router history mode to work correctly
    app.get('*', (req, res) => {
      // Skip API routes (they should be handled by earlier middleware)
      if (req.path.startsWith('/api') || req.path === '/health') {
        res.status(404).json({ error: 'Route not found' });
        return;
      }

      const indexPath = join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
  console.log(
    `Proxy Mode: ${PROXY_MODE === 'puppeteer' ? 'Puppeteer (high CPU/memory)' : 'AllOrigins/got-scraping (lightweight)'}`,
  );
  console.log('Proxy Targets Configured');
});
