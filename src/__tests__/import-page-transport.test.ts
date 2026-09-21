import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';
import { Novel18SyosetuScraper } from '../services/scraper/scrapers/novel18-syosetu-scraper';
import { ProxyService } from '../services/proxy-service';
import { useSettingsStore } from '../stores/settings';

afterEach(() => mock.restore());

describe('导入的单页面抓取与解析入口', () => {
  it('请求指定目录页一次，快照解析返回下一页而不自行读取章节', async () => {
    await useSettingsStore().updateSettings({ proxyEnabled: false });
    const html = readFileSync(join(__dirname, 'examplePages/novel18-n7686kd-p1.html'), 'utf8');
    const request = spyOn(axios, 'get').mockResolvedValue({
      data: html,
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    const scraper = new Novel18SyosetuScraper();
    const snapshot = await scraper.fetchPageSnapshot('https://novel18.syosetu.com/n7686kd/');
    const result = scraper.parseNovelSnapshot(snapshot.html, snapshot.requestUrl);
    expect(request).toHaveBeenCalledTimes(1);
    expect(snapshot.html).toBe(html);
    expect(result.info.chapters.length).toBeGreaterThan(0);
    expect(result.nextPageUrls).toHaveLength(1);
    expect(result.nextPageUrls[0]).toContain('p=2');
  });

  it('纯正文解析入口不发起网络请求，并与旧入口结果一致', async () => {
    await useSettingsStore().updateSettings({ proxyEnabled: false });
    const html =
      '<div class="p-novel__body"><div class="p-novel__text"><p>　第一段</p><p>第二段<br>续行</p></div></div>';
    const scraper = new NcodeSyosetuScraper();
    const request = spyOn(axios, 'get').mockResolvedValue({ data: html, status: 200, headers: {} });
    const result = scraper.parseChapterSnapshot(html);
    expect(request).not.toHaveBeenCalled();
    expect(result.paragraphs).toContain('　第一段');
    expect(await scraper.fetchChapterContent('https://ncode.syosetu.com/n1234ab/1/')).toBe(
      result.text,
    );
  });

  it('已有代理和 novel18 头保持可用，JSON 包装拆出正文', async () => {
    const html = '<html><body>原始 HTML</body></html>';
    spyOn(ProxyService, 'executeWithAutoSwitch').mockImplementation(async (_url, request) =>
      request('https://proxy.example/?url=target'),
    );
    const request = spyOn(axios, 'get').mockResolvedValue({
      data: { contents: html },
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const snapshot = await new Novel18SyosetuScraper().fetchPageSnapshot(
      'https://novel18.syosetu.com/n1234ab/',
    );
    expect(snapshot.html).toBe(html);
    expect(request.mock.calls[0]?.[1]?.headers?.['x-cors-headers']).toBe('{"Cookie":"over18=yes"}');
    expect(snapshot.transportUrl).toBe('https://proxy.example/?url=target');
  });

  it('预先取消不请求，在途取消不轮换代理或接收迟到结果', async () => {
    await useSettingsStore().updateSettings({ proxyEnabled: false });
    const scraper = new NcodeSyosetuScraper();
    const controller = new AbortController();
    controller.abort();
    let started: () => void = () => undefined;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const request = spyOn(axios, 'get').mockImplementation(() => {
      started();
      return new Promise(() => {});
    });
    await expect(
      scraper.fetchPageSnapshot('https://ncode.syosetu.com/n1234ab/', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    await useSettingsStore().updateSettings({ proxyEnabled: true });
    const running = new AbortController();
    const result = scraper.fetchPageSnapshot('https://ncode.syosetu.com/n1234ab/', running.signal);
    await requestStarted;
    running.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.signal).toBe(running.signal);
  });
});
