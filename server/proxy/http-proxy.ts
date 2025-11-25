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

    const stream = gotScraping.stream({
      url: targetUrl,
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH',
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      http2: false,
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 110 }],
        devices: ['desktop'],
        locales: ['ja-JP', 'en-US'],
        operatingSystems: ['windows'],
      },
      timeout: { request: 90000 },
      retry: { limit: 2 },
    });

    stream.on(
      'response',
      (response: {
        statusCode: number;
        headers: Record<string, string | string[] | undefined>;
      }) => {
        res.status(response.statusCode);
        const headersToSkip = [
          'content-encoding',
          'transfer-encoding',
          'connection',
          'set-cookie',
          'content-security-policy',
          'x-frame-options',
          'content-length',
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
      },
    );

    await streamPipeline(stream, res);
    console.log(`[Direct] [${requestId}] Completed`);
  } catch (error) {
    console.error(`[Direct Error] [${requestId}]`, error);
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
      http2: false,
      timeout: { request: 90000 },
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

