import express, { type Request, type Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === 'production';

// --- Configuration ---

interface TargetConfig {
  baseUrl: string;
  mode: 'direct';
}

// Define your targets here
const TARGETS: Record<string, TargetConfig> = {
  '/api/sda1': { baseUrl: 'https://p.sda1.dev', mode: 'direct' },
  '/api/kakuyomu': { baseUrl: 'https://kakuyomu.jp', mode: 'direct' },
  '/api/ncode': { baseUrl: 'https://ncode.syosetu.com', mode: 'direct' },
  '/api/novel18': { baseUrl: 'https://novel18.syosetu.com', mode: 'direct' },
  // Puppeteer + Stealth handles Cloudflare, so we use direct mode for syosetu.org too
  '/api/syosetu': { baseUrl: 'https://syosetu.org', mode: 'direct' },
  '/api/search': { baseUrl: 'https://html.duckduckgo.com/html', mode: 'direct' },
};

// --- Puppeteer Instance ---

let browserPromise: Promise<Browser> | null = null;

const getBrowser = async (): Promise<Browser> => {
  if (!browserPromise) {
    console.log('[Puppeteer] Launching browser...');
    // Store the promise before awaiting to prevent race conditions
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // Set up disconnected handler after browser is created
    browserPromise
      .then((browser) => {
        browser.on('disconnected', () => {
          console.log('[Puppeteer] Browser disconnected.');
          browserPromise = null;
        });
      })
      .catch((error) => {
        console.error('[Puppeteer] Failed to launch browser:', error);
        browserPromise = null;
        throw error;
      });
  }
  return await browserPromise;
};

// --- Proxy Handlers ---

const handleDirectProxy = async (
  req: Request,
  res: Response,
  targetUrl: string,
  requestId: string,
) => {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    console.log(`[Puppeteer] [${requestId}] Navigating to ${targetUrl}`);

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const content = await page.content();
    console.log(`[Puppeteer] [${requestId}] Page loaded. Content length: ${content.length}`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(content);
  } catch (error) {
    console.error(`[Puppeteer Error] [${requestId}]`, error);
    throw error;
  } finally {
    if (page) {
      await page.close().catch((e) => console.error(`[Puppeteer] Error closing page:`, e));
    }
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
    await handleDirectProxy(req, res, targetUrl, requestId);
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && error.message.includes('Timeout');
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

// Generic Proxy Handler for arbitrary URLs
const handleGenericProxy = async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  console.log(`[Proxy Generic] [${requestId}] Fetching ${url}`);

  try {
    await handleDirectProxy(req, res, url, requestId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Proxy Generic Error] [${requestId}] ${message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy Request Failed', message });
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
  console.log('Proxy Targets Configured (Puppeteer Direct Mode)');
});
