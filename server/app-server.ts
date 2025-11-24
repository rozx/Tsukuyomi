import express, { type Request, type Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { gotScraping } from 'got-scraping';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const isProduction = process.env.NODE_ENV === 'production';

// --- Configuration ---

// Define your targets here
const TARGETS: Record<string, string> = {
  '/api/sda1': 'https://p.sda1.dev',
  '/api/kakuyomu': 'https://kakuyomu.jp',
  '/api/ncode': 'https://ncode.syosetu.com',
  '/api/novel18': 'https://novel18.syosetu.com',
  '/api/syosetu': 'https://syosetu.org', // Replaces the AllOrigins hack
  '/api/search': 'https://html.duckduckgo.com/html',
};

// --- Proxy Logic using Got-Scraping ---

const handleProxyRequest = async (
  req: Request,
  res: Response,
  targetBaseUrl: string,
  pathPrefix: string,
) => {
  // 1. Calculate the final URL
  // Removes the prefix (e.g., /api/kakuyomu) and appends the rest to the target
  const pathPart = req.path.replace(pathPrefix, '');
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

  // Special case for DuckDuckGo which needs the /html path maintained or adjusted based on your specific logic
  // For this specific mapping, we just join them.
  const targetUrl = `${targetBaseUrl}${pathPart}${queryString}`;

  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  console.log(`[Proxy] [${requestId}] ${req.method} ${req.path} -> ${targetUrl}`);

  try {
    // 2. Create the stream using got-scraping
    // This mimics a real Chrome browser on Windows to bypass blocking
    const stream = gotScraping.stream({
      url: targetUrl,
      method: req.method as any, // GET, POST, etc.
      // Pass body for POST requests if needed, though usually novel APIs are GET
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,

      // Key Configuration for Bypassing Blocks:
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 110 }],
        devices: ['desktop'],
        locales: ['ja-JP', 'en-US'], // Important for Japanese sites
        operatingSystems: ['windows'],
      },

      // Timeout configuration (internal request timeout)
      timeout: {
        request: 90000, // 90s to beat Cloudflare 100s
      },
      retry: { limit: 2 },
    });

    // 3. Handle Response Headers
    stream.on('response', (response) => {
      // Forward status code
      res.status(response.statusCode);

      // Forward relevant headers, remove problematic ones
      const headersToSkip = [
        'content-encoding', // We let the stream handle decompression
        'transfer-encoding',
        'connection',
        'set-cookie', // Optional: skip cookies to prevent cross-domain issues
        'content-security-policy', // Remove CSP to allow frontend rendering
        'x-frame-options',
      ];

      Object.entries(response.headers).forEach(([key, value]) => {
        if (!headersToSkip.includes(key.toLowerCase()) && value) {
          if (typeof value === 'string' || typeof value === 'number') {
            res.setHeader(key, value);
          } else if (Array.isArray(value)) {
            res.setHeader(key, value.join(', '));
          }
        }
      });
    });

    // 4. Pipe the data (Streaming)
    // using streamPipeline ensures proper error handling and cleanup
    await streamPipeline(stream, res);

    console.log(`[Proxy] [${requestId}] Completed`);
  } catch (error: any) {
    // Check for common error codes
    const isTimeout = error.code === 'ETIMEDOUT';
    console.error(`[Proxy Error] [${requestId}] ${error.message}`);

    if (!res.headersSent) {
      res.status(isTimeout ? 504 : 500).json({
        error: 'Proxy Request Failed',
        message: error.message,
        code: error.code,
      });
    }
  }
};

// --- Register API Routes ---

// Register routes based on the TARGETS map
Object.entries(TARGETS).forEach(([pathPrefix, targetBase]) => {
  app.use(pathPrefix, (req, res) => {
    // We intentionally do not await this async function here to avoid blocking the event loop,
    // but express handles async route handlers correctly in newer versions.
    // To satisfy linter for this specific call if strict:
    void handleProxyRequest(req, res, targetBase, pathPrefix);
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: isProduction ? 'production' : 'development' });
});

// --- Static Files & Frontend Serving ---

const VITE_DEV_PORT = Number(process.env.VITE_PORT) || 9000;

if (isProduction) {
  // Production: Serve built files
  const distPath = join(__dirname, '../dist/spa');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));

    // SPA Catch-all
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
  // Development: Proxy to Vite
  void (async () => {
    try {
      const { createProxyMiddleware } = await import('http-proxy-middleware');
      const viteTarget = `http://localhost:${VITE_DEV_PORT}`;
      const middleware = createProxyMiddleware({
        target: viteTarget,
        changeOrigin: true,
        ws: true,
      });
      // Type assertion needed because Express types don't fully support async middleware
      app.use(middleware as express.RequestHandler);
      console.log(`Dev Mode: Proxying non-API requests to ${viteTarget}`);
    } catch (err) {
      console.error('Failed to start Vite proxy:', err);
    }
  })();
}

// --- Start Server ---

app.listen(PORT, () => {
  console.log(`Luna AI Translator Server running on port ${PORT}`);
  console.log(`Mode: ${isProduction ? 'Production' : 'Development'}`);
  console.log('Proxy Targets Configured using Got-Scraping (Anti-Bot Bypass Active)');
});
