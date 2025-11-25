import type { Request, Response } from 'express';
import { gotScraping } from 'got-scraping';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

/**
 * AllOrigins API response structure
 */
interface AllOriginsResponse {
  status?: {
    http_code: number;
    message?: string;
  };
  contents?: string;
}

/**
 * Handle direct proxy request using got-scraping
 * Lightweight approach for sites that don't require JS execution
 */
export const handleDirectProxy = async (
  req: Request,
  res: Response,
  targetUrl: string,
  requestId: string,
): Promise<void> => {
  try {
    console.log(`[Direct] [${requestId}] Fetching ${targetUrl}`);

    // Immediately set headers to prevent timeout
    // This tells the load balancer that the connection is active
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if present

    const stream = gotScraping.stream({
      url: targetUrl,
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH',
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      http2: false, // Disable HTTP/2 to avoid origin matching issues
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 110 }],
        devices: ['desktop'],
        locales: ['ja-JP', 'en-US'],
        operatingSystems: ['windows'],
      },
      timeout: { request: 120000 }, // 120 seconds to match server timeout
      retry: { limit: 2 },
    });

    let headersSent = false;

    stream.on(
      'response',
      (response: {
        statusCode: number;
        headers: Record<string, string | string[] | undefined>;
      }) => {
        if (!headersSent) {
          res.status(response.statusCode);
          const headersToSkip = [
            'content-encoding',
            'transfer-encoding',
            'connection',
            'set-cookie',
            'content-security-policy',
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
          headersSent = true;
        }
      },
    );

    stream.on('error', (error: Error) => {
      console.error(`[Direct Stream Error] [${requestId}]`, error);
      if (!headersSent && !res.headersSent) {
        res.status(500).json({
          error: 'Stream Error',
          message: error.message,
        });
      }
    });

    await streamPipeline(stream, res);
    console.log(`[Direct] [${requestId}] Completed`);
  } catch (error) {
    console.error(`[Direct Error] [${requestId}]`, error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    throw error;
  }
};

/**
 * Handle proxy request using AllOrigins API
 * Uses AllOrigins.win service to bypass CORS and Cloudflare protection
 */
export const handleAllOriginsProxy = async (
  req: Request,
  res: Response,
  targetUrl: string,
  requestId: string,
): Promise<void> => {
  try {
    // AllOrigins API format: https://api.allorigins.win/get?url=...
    const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    console.log(`[AllOrigins] [${requestId}] Fetching via ${allOriginsUrl}`);

    const response = await gotScraping({
      url: allOriginsUrl,
      responseType: 'json',
      http2: false, // Disable HTTP/2 to avoid origin matching issues
      timeout: { request: 120000 }, // 120 seconds to match server timeout
      retry: { limit: 2 },
    });

    const data = response.body as AllOriginsResponse;

    if (data.status?.http_code) {
      res.status(data.status.http_code);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // AllOrigins returns the HTML content in the 'contents' field
      res.send(data.contents);
      console.log(`[AllOrigins] [${requestId}] Completed (Status: ${data.status.http_code})`);
    } else {
      throw new Error(
        `AllOrigins returned invalid data: ${JSON.stringify(data).substring(0, 100)}`,
      );
    }
  } catch (error) {
    console.error(`[AllOrigins Error] [${requestId}]`, error);
    throw error;
  }
};

