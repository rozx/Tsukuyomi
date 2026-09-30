import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  LocalizedError,
  localizedErrorCode,
  localizedErrorMessage,
} from 'src/utils/localized-error';
import { SyosetuScraper } from 'src/services/scraper/scrapers/syosetu-scraper';
import { NcodeSyosetuScraper } from 'src/services/scraper/scrapers/ncode-syosetu-scraper';
import { Novel18SyosetuScraper } from 'src/services/scraper/scrapers/novel18-syosetu-scraper';
import { KakuyomuScraper } from 'src/services/scraper/scrapers/kakuyomu-scraper';
import { BlockedResponseError, HttpStatusError } from 'src/services/proxy-fetch-plan';
import {
  FirecrawlEmptyContentError,
  FirecrawlError,
  FirecrawlQuotaError,
  FirecrawlRateLimitError,
  FirecrawlTargetError,
} from 'src/services/firecrawl/firecrawl-errors';
import { fetchScraperPage } from 'src/services/scraper/core/page-transport';
import { useSettingsStore } from 'src/stores/settings';
import { BookSyncReplay } from 'src/services/book-sync/replay';
import { importNoticeText } from 'src/services/import/import-error';
import type { BookUpdateRecipe } from 'src/models/book-sync';

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;

function expectLocalized(error: unknown, code: string, zhCN: string): LocalizedError {
  expect(error).toBeInstanceOf(LocalizedError);
  const localized = error as LocalizedError;
  expect(localized.code).toBe(code);
  expect(localized.message).toBe(zhCN);
  expect(localized.messageFor('en-US')).not.toMatch(CJK);
  expect(localized.messageFor('zh-TW')).toMatch(CJK);
  return localized;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('爬虫自有错误带错误码并按界面语言渲染', () => {
  it.each([
    [new KakuyomuScraper(), '无效的 kakuyomu.jp 小说 URL'],
    [new SyosetuScraper(), '无效的 syosetu.org 小说 URL'],
    [new NcodeSyosetuScraper(), '无效的 ncode.syosetu.com 小说 URL'],
    [new Novel18SyosetuScraper(), '无效的 novel18.syosetu.com 小说 URL'],
  ])('无效 URL：结果保留简中 error，并携带错误码与原错误', async (scraper, zhCN) => {
    const result = await scraper.fetchNovel('https://example.com/not-a-novel');
    expect(result.success).toBe(false);
    expect(result.error).toBe(zhCN);
    expect(result.errorCode).toBe('SCRAPER_INVALID_URL');
    expectLocalized(result.cause, 'SCRAPER_INVALID_URL', zhCN);
    expect(localizedErrorMessage(result.cause, 'en-US', 'bookUi.scraper.unknown')).toContain('URL');
  });

  it.each([
    ['kakuyomu', new KakuyomuScraper()],
    ['syosetu.org', new SyosetuScraper()],
    ['ncode', new NcodeSyosetuScraper()],
  ])('%s 正文缺失抛出 SCRAPER_CONTENT_MISSING', (_name, scraper) => {
    let thrown: unknown;
    try {
      scraper.parseChapterSnapshot('<html><body><p></p></body></html>');
    } catch (error) {
      thrown = error;
    }
    expectLocalized(thrown, 'SCRAPER_CONTENT_MISSING', '无法找到章节正文内容');
  });

  it('novel18 年龄确认页抛出 SCRAPER_AGE_GATE', () => {
    const html =
      '<html lang="ja"><head><title>年齢確認</title></head><body><a id="yes18">Enter</a></body></html>';
    let thrown: unknown;
    try {
      new Novel18SyosetuScraper().parseNovelSnapshot(html, 'https://novel18.syosetu.com/n1/');
    } catch (error) {
      thrown = error;
    }
    expectLocalized(thrown, 'SCRAPER_AGE_GATE', '目标网站返回了年龄确认页，未能获取小说内容');
  });

  it('kakuyomu 缺少 __NEXT_DATA__ 时保留诊断数字', () => {
    let thrown: unknown;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      new KakuyomuScraper().parseNovelSnapshot(
        '<html><body></body></html>',
        'https://kakuyomu.jp/works/1',
      );
    } catch (error) {
      thrown = error;
    }
    const error = expectLocalized(
      thrown,
      'SCRAPER_PARSE_FAILED',
      '无法找到 Kakuyomu 数据（__NEXT_DATA__ 不存在）。页面可能未完全加载或结构已改变。HTML 长度: 26，脚本标签数: 0',
    );
    expect(error.messageFor('en-US')).toContain('26');
  });
});

describe('抓取链路自有错误带错误码', () => {
  it('HttpStatusError 与 BlockedResponseError', () => {
    const status = expectLocalized(
      new HttpStatusError(503),
      'FETCH_HTTP_STATUS',
      '目标网站返回错误: 503',
    );
    expect((status as HttpStatusError).status).toBe(503);
    expectLocalized(
      new BlockedResponseError(),
      'FETCH_BLOCKED',
      '目标网站返回了反爬质询页（Electron 直连）',
    );
    expectLocalized(
      new BlockedResponseError('https://cors.test/?x'),
      'FETCH_BLOCKED',
      '目标网站返回了反爬质询页（https://cors.test/?x）',
    );
  });

  it('Firecrawl 错误保留类型与字段，说明按语言渲染', () => {
    const keyless = expectLocalized(
      new FirecrawlQuotaError(true),
      'FIRECRAWL_QUOTA',
      'Firecrawl 免费额度（按 IP 每日限额）已用尽，可在设置 → API Keys 配置 Firecrawl Key',
    );
    expect(keyless).toBeInstanceOf(FirecrawlError);
    expectLocalized(
      new FirecrawlQuotaError(false),
      'FIRECRAWL_QUOTA',
      'Firecrawl 额度已用尽，请在设置 → API Keys 中检查额度',
    );
    expectLocalized(
      new FirecrawlRateLimitError(),
      'FIRECRAWL_RATE_LIMITED',
      'Firecrawl 请求过于频繁，请稍后重试',
    );
    const target = expectLocalized(
      new FirecrawlTargetError(404),
      'FIRECRAWL_TARGET_FAILED',
      '目标网站返回错误: 404（经 Firecrawl）',
    );
    expect((target as FirecrawlTargetError).targetStatus).toBe(404);
    expectLocalized(
      new FirecrawlEmptyContentError(),
      'FIRECRAWL_EMPTY_CONTENT',
      'Firecrawl 返回的内容为空',
    );
    const http = FirecrawlError.http(503, 'provider 原始诊断');
    expect(http.message).toBe('Firecrawl 请求失败: 503 provider 原始诊断');
    expect(http.status).toBe(503);
    expect(http.diagnostic).toBe('provider 原始诊断');
    expect(http.messageFor('en-US')).toContain('provider 原始诊断');
    expect(FirecrawlError.http(500, '').message).toBe('Firecrawl 请求失败: 500');
  });

  it('网络失败归一化为 FETCH_NETWORK_FAILED', async () => {
    await useSettingsStore().updateSettings({
      proxyEnabled: false,
      proxySiteMapping: {},
      firecrawlFallbackEnabled: false,
    });
    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        code: 'ERR_BAD_REQUEST',
        request: {},
      }),
    );
    const error = await fetchScraperPage('https://example.com/page').catch((e: unknown) => e);
    expectLocalized(error, 'FETCH_NETWORK_FAILED', '网络连接失败，请检查网络设置');
    expect(localizedErrorCode(error)).toBe('FETCH_NETWORK_FAILED');
  });
});

describe('书籍同步失败记录可按界面语言重投影爬虫错误', () => {
  it('正文缺失的失败记录在英文界面没有中文', async () => {
    const recipe: BookUpdateRecipe = {
      version: 1,
      catalogUrls: ['https://syosetu.org/novel/1/'],
      engine: { kind: 'builtin', site: 'syosetu-org' },
    } as BookUpdateRecipe;
    const replay = new BookSyncReplay(recipe);
    vi.spyOn(SyosetuScraper.prototype, 'fetchPageSnapshot').mockResolvedValue({
      html: '<html><body><p></p></body></html>',
      requestUrl: 'https://syosetu.org/novel/1/1.html',
      transportUrl: 'https://syosetu.org/novel/1/1.html',
      status: 200,
      contentType: 'text/html',
    });
    const result = await replay.fetchChapter(
      { url: 'https://syosetu.org/novel/1/1.html', title: '第一话' },
      true,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(importNoticeText(result, 'zh-CN')).toContain('无法找到章节正文内容');
    expect(importNoticeText(result, 'en-US')).not.toMatch(CJK);
  });
});
