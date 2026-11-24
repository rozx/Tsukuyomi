/**
 * 生成 README 用的界面截图。
 *
 *   bun run dev                       # 先在另一个终端启动开发服务器（默认 http://localhost:9000）
 *   bun run screenshots               # 三种语言 × 桌面 / 平板 / 手机，全部重拍
 *   bun run screenshots --locale en-US --device desktop --only library
 *
 * 每种语言使用一个全新的无痕浏览器上下文，在页面里写入演示书库（见 seed-in-page.ts），
 * 不会碰到本机浏览器里的真实数据。输出到 public/screenshots/<语言>/<设备>-<名称>.webp。
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import sharp from 'sharp';
import { APP_LOCALES, isAppLocale } from 'src/models/locale';
import type { AppLocale } from 'src/models/locale';
import { loadAozoraWork } from './aozora';
import type { AozoraVolume } from './aozora';
import { DEMO_BOOKS } from './demo-library';
import type { DemoSeedPayload, DemoSeedResult } from './seed-in-page';
import { DEVICES, SHOTS, prepareShot } from './shots';
import type { DeviceName, ShotContext } from './shots';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_DIR = join(ROOT, 'node_modules/.cache/tsukuyomi-screenshots');
const SEED_MODULE = '/scripts/screenshots/seed-in-page.ts';
/** 截图时不向统计服务发请求 */
const BLOCKED_HOSTS = ['cloudflareinsights.com'];
/** 操作产生的提示气泡不进截图 */
const HIDE_TOASTS = '.p-toast { display: none !important; }';

function parseOptions() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://localhost:9000' },
      out: { type: 'string', default: join(ROOT, 'public/screenshots') },
      locale: { type: 'string' },
      device: { type: 'string' },
      only: { type: 'string' },
    },
  });
  const list = (value: string | undefined) =>
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  const locales = list(values.locale) ?? [...APP_LOCALES];
  const devices = list(values.device) ?? Object.keys(DEVICES);
  for (const locale of locales) {
    if (!isAppLocale(locale)) throw new Error(`不支持的语言：${locale}`);
  }
  for (const device of devices) {
    if (!(device in DEVICES)) throw new Error(`不支持的设备：${device}`);
  }
  return {
    url: values.url.replace(/\/$/, ''),
    out: resolve(values.out),
    locales: locales as AppLocale[],
    devices: devices as DeviceName[],
    only: list(values.only),
  };
}

/** 优先用环境变量指定的浏览器，其次是常见的预装路径，最后交给 Puppeteer 自己找 */
function findBrowser(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium',
  ];
  return candidates.find((path): path is string => !!path && existsSync(path));
}

async function loadWorks(): Promise<Record<string, AozoraVolume[]>> {
  const works: Record<string, AozoraVolume[]> = {};
  for (const book of DEMO_BOOKS) {
    works[book.key] = await loadAozoraWork(book.aozoraPath, CACHE_DIR);
  }
  return works;
}

async function settle(page: Page, extraMs = 500): Promise<void> {
  // 开发服务器的热更新连接会让页面一直不算空闲，等不到就按超时继续
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 4000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await new Promise((done) => setTimeout(done, extraMs));
}

async function openPage(browser: Browser, baseUrl: string): Promise<Page> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const blocked = BLOCKED_HOSTS.some((host) => new URL(request.url()).hostname.endsWith(host));
    void (blocked ? request.abort() : request.continue());
  });
  page.on('pageerror', (error) => console.warn('  [页面错误]', String(error).slice(0, 300)));
  await page.setViewport(DEVICES.desktop);
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  } catch {
    throw new Error(`打不开 ${baseUrl}，请先运行 bun run dev`);
  }
  await page.waitForSelector('#q-app > *');
  await settle(page);
  return page;
}

async function seed(page: Page, payload: DemoSeedPayload): Promise<DemoSeedResult> {
  const expression = `import(${JSON.stringify(SEED_MODULE)}).then((m) => m.seedDemoLibrary(${JSON.stringify(payload)}))`;
  return (await page.evaluate(expression)) as DemoSeedResult;
}

async function saveScreenshot(page: Page, file: string): Promise<number> {
  const raw = await page.screenshot({ type: 'png' });
  await mkdir(dirname(file), { recursive: true });
  // WebP 比同尺寸 PNG 小一个量级，GitHub 的 README 可以直接显示
  const info = await sharp(raw).webp({ quality: 86, effort: 6 }).toFile(file);
  return info.size;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const works = await loadWorks();
  const executablePath = findBrowser();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    for (const locale of options.locales) {
      console.log(`\n== ${locale} ==`);
      const page = await openPage(browser, options.url);
      const seeded = await seed(page, { locale, works });
      const context: ShotContext = { baseUrl: options.url, locale, ...seeded };

      for (const device of options.devices) {
        await page.setViewport(DEVICES[device]);
        for (const shot of SHOTS) {
          if (!shot.devices.includes(device)) continue;
          if (options.only && !options.only.includes(shot.name)) continue;
          await page.goto(options.url + shot.path(context), { waitUntil: 'domcontentloaded' });
          await settle(page);
          await page.addStyleTag({ content: HIDE_TOASTS });
          await prepareShot(page, shot, context, device);
          await settle(page, 300);
          const file = join(options.out, locale, `${device}-${shot.name}.webp`);
          const size = await saveScreenshot(page, file);
          console.log(`  ${device}-${shot.name}.webp  ${(size / 1024).toFixed(0)} KB`);
        }
      }
      await page.browserContext().close();
    }
  } finally {
    await browser.close();
  }
}

await main();
