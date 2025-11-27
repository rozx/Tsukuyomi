import type { Request, Response } from 'express';
import axios, { type AxiosResponse } from 'axios';

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
 * Handle direct proxy request using axios
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

    const response: AxiosResponse = await axios({
      url: targetUrl,
      method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      timeout: 120000, // 120 seconds to match server timeout
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: new URL(targetUrl).origin,
      },
      validateStatus: () => true, // Don't throw on any status code
    });

    // 记录响应信息用于调试
    const dataStr = typeof response.data === 'string' ? response.data : String(response.data);
    console.log(`[Direct] [${requestId}] Response received`, {
      status: response.status,
      contentType: response.headers['content-type'],
      dataLength: dataStr.length,
      dataPreview: dataStr.substring(0, 500),
      isHtml: dataStr.includes('<html') || dataStr.includes('<!DOCTYPE'),
      isJson: dataStr.trim().startsWith('{') || dataStr.trim().startsWith('['),
      targetUrl,
    });

    // Set response status
    res.status(response.status);

    // Copy headers (excluding problematic ones)
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

    // Send response body
    res.send(response.data);
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

    const response = await axios.get<string>(allOriginsUrl, {
      timeout: 120000, // 120 seconds to match server timeout
      responseType: 'text', // Get as text to check for HTML error pages
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      validateStatus: () => true, // Don't throw on any status code
    });

    // Check if AllOrigins API itself returned an error
    if (response.status >= 400) {
      const errorMessage =
        response.status === 502
          ? 'AllOrigins service is temporarily unavailable (502 Bad Gateway). Please try again later.'
          : `AllOrigins API returned error: ${response.status} ${response.statusText}`;
      console.error(`[AllOrigins Error] [${requestId}] ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Check if response is HTML (like Cloudflare error page), it means AllOrigins is down
    if (response.data.includes('Bad gateway') || response.data.includes('502')) {
      const errorMessage = 'AllOrigins service is temporarily unavailable. Please try again later.';
      console.error(`[AllOrigins Error] [${requestId}] ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Parse JSON response
    let data: AllOriginsResponse;
    try {
      data = JSON.parse(response.data) as AllOriginsResponse;
    } catch {
      throw new Error('AllOrigins returned invalid response format');
    }

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
    // Log only essential error information, not the entire error object
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const message = error.message;
      console.error(
        `[AllOrigins Error] [${requestId}] ${message}${status ? ` (Status: ${status} ${statusText})` : ''}`,
      );
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AllOrigins Error] [${requestId}] ${message}`);
    }
    throw error;
  }
};
