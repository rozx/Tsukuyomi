import type { Request, Response } from 'express';
import type { Browser, Page } from 'puppeteer';
import { existsSync } from 'fs';

// --- Puppeteer Instance ---

let browserPromise: Promise<Browser> | null = null;

const getBrowser = async (): Promise<Browser> => {
  if (!browserPromise) {
    console.log('[Puppeteer] Launching browser...');

    const puppeteer = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
    const { executablePath } = await import('puppeteer');

    puppeteer.default.use(StealthPlugin.default());

    // 配置 Puppeteer 启动选项
    const launchOptions: Parameters<typeof puppeteer.default.launch>[0] = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };

    // 尝试获取 Chrome 可执行文件路径
    try {
      const chromePath = executablePath();
      if (chromePath && existsSync(chromePath)) {
        launchOptions.executablePath = chromePath;
        console.log(`[Puppeteer] Using Chrome executable: ${chromePath}`);
      } else {
        console.warn(`[Puppeteer] Chrome executable not found at ${chromePath}, using default`);
      }
    } catch (error) {
      console.warn('[Puppeteer] Could not determine Chrome executable path:', error);
    }

    // Store the promise before awaiting to prevent race conditions
    browserPromise = puppeteer.default.launch(launchOptions);

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

/**
 * Handle proxy request using Puppeteer
 * This is resource-intensive (high CPU/memory) but can bypass Cloudflare and other JS challenges
 */
export const handlePuppeteerProxy = async (
  req: Request,
  res: Response,
  targetUrl: string,
  requestId: string,
): Promise<void> => {
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

