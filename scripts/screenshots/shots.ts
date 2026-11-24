import type { Page, Viewport } from 'puppeteer';
import type { AppLocale } from 'src/models/locale';
import type { DemoSeedResult } from './seed-in-page';

/**
 * 截图清单：每一项是一个路由，加上可选的页面内操作（展开面板、打开弹层等）。
 * UI 改动后如果选择器失效，只需要改这里。
 */

export type DeviceName = 'desktop' | 'tablet' | 'mobile';

export const DEVICES: Record<DeviceName, Viewport> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  tablet: { width: 1180, height: 820, deviceScaleFactor: 2, hasTouch: true },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};

export interface ShotContext extends DemoSeedResult {
  baseUrl: string;
  locale: AppLocale;
}

export interface Shot {
  name: string;
  devices: DeviceName[];
  path: (context: ShotContext) => string;
  /** 桌面 / 平板右侧的月詠面板：默认收起；keep 表示交给页面自己决定（导入页会自动打开） */
  assistant?: 'open' | 'closed' | 'keep';
  prepare?: (page: Page, context: ShotContext, device: DeviceName) => Promise<void>;
}

const ALL: DeviceName[] = ['desktop', 'tablet', 'mobile'];

async function click(page: Page, selector: string): Promise<void> {
  const target = await page.waitForSelector(selector, { visible: true, timeout: 8000 });
  await target?.click();
}

/** 月詠面板的开合状态会被记住，所以每张截图前都按清单对齐一次 */
async function setAssistant(page: Page, open: boolean): Promise<void> {
  const toggle = await page.$('button.system-bar-chip[aria-pressed]');
  if (!toggle) return;
  const pressed = await toggle.evaluate((node) => node.getAttribute('aria-pressed') === 'true');
  if (pressed !== open) await toggle.click();
}

export async function prepareShot(
  page: Page,
  shot: Shot,
  context: ShotContext,
  device: DeviceName,
): Promise<void> {
  if (shot.assistant !== 'keep') await setAssistant(page, shot.assistant === 'open');
  await shot.prepare?.(page, context, device);
}

/** 导入页：新建任务后登记一个网址，停在「来源」这一步并展开添加区 */
async function prepareImport(page: Page): Promise<void> {
  await click(page, '.p-button:has(.pi-plus)');
  const url = await page.waitForSelector('.isa-url-input', { visible: true, timeout: 8000 });
  await url?.type('https://www.aozora.gr.jp/index_pages/person81.html');
  await page.keyboard.press('Enter');
  // 有了第一个来源后添加区会收起，重新展开让截图里同时看得到来源列表和添加方式
  await click(page, '.isp-add-toggle');
}

const book = (context: ShotContext, suffix = '') => `/books/${context.mainBookId}${suffix}`;

export const SHOTS: Shot[] = [
  { name: 'index', devices: ALL, path: () => '/' },
  { name: 'library', devices: ['desktop', 'mobile'], path: () => '/books' },
  { name: 'reader', devices: ALL, path: (context) => book(context) },
  {
    name: 'reader-chat',
    devices: ['desktop'],
    path: (context) => book(context),
    assistant: 'open',
  },
  {
    name: 'chat',
    devices: ['mobile'],
    path: (context) => book(context),
    prepare: (page) => click(page, '.mobile-tabbar .tab:nth-child(3)'),
  },
  {
    name: 'task-center',
    devices: ['desktop'],
    path: (context) => book(context),
    prepare: (page) => click(page, '.tc-chip'),
  },
  {
    name: 'characters',
    devices: ['desktop'],
    path: (context) => book(context, '/settings/characters'),
  },
  { name: 'ai-models', devices: ['desktop'], path: () => '/ai' },
  {
    name: 'import',
    devices: ['desktop'],
    path: () => '/import',
    assistant: 'keep',
    prepare: prepareImport,
  },
  { name: 'agent-mcp', devices: ['desktop'], path: () => '/mcp' },
];
