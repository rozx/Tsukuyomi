import { describe, it, expect } from 'bun:test';
import { NcodeSyosetuScraper } from '../services/scraper/scrapers/ncode-syosetu-scraper';

class TestScraper extends NcodeSyosetuScraper {
  public exposeNext(html: string, url: string) {
    return this.getNextPageUrl(html, url);
  }
}

const baseUrl = 'https://ncode.syosetu.com/n2032iz/';

describe('NcodeSyosetuScraper pagination', () => {
  const scraper = new TestScraper();

  it('detects next via rel="next"', () => {
    const html = `
      <html><body>
        <nav class="pagination">
          <a href="?p=1">1</a>
          <span class="current">2</span>
          <a rel="next" href="?p=3">次へ</a>
        </nav>
      </body></html>
    `;
    const next = scraper.exposeNext(html, `${baseUrl}?p=2`);
    expect(next).toBe(`${baseUrl}?p=3`);
  });

  it('detects next via known classnames', () => {
    const html = `
      <html><body>
        <ul class="pagination">
          <li><a href="?p=2">2</a></li>
          <li class="next"><a href="?p=3">»</a></li>
        </ul>
      </body></html>
    `;
    const next = scraper.exposeNext(html, `${baseUrl}?p=2`);
    expect(next).toBe(`${baseUrl}?p=3`);
  });

  // 与站点实际目录页结构一致：末页的「次へ」「最後へ」是不带链接的 span
  const contentsPage = (page: number, last: boolean, titles: string[]) => `
    <html><body><div class="l-container"><main><article>
      <div class="c-pager"><div class="c-pager__pager">
        <a href="/n2032iz/" class="c-pager__item c-pager__item--first">最初へ</a>
        ${page > 1 ? `<a href="/n2032iz/?p=${page - 1}" class="c-pager__item c-pager__item--before">前へ</a>` : '<span class="c-pager__item c-pager__item--before">前へ</span>'}
        ${last ? '<span class="c-pager__item c-pager__item--next">次へ</span>' : `<a href="/n2032iz/?p=${page + 1}" class="c-pager__item c-pager__item--next">次へ</a>`}
        ${last ? '<span class="c-pager__item c-pager__item--last">最後へ</span>' : '<a href="/n2032iz/?p=9" class="c-pager__item c-pager__item--last">最後へ</a>'}
      </div></div>
      <div class="p-eplist">
        ${titles.map((title, i) => `<div class="p-eplist__sublist"><a href="/n2032iz/${200 + i}/" class="p-eplist__subtitle">${title}</a></div>`).join('')}
      </div>
    </article></main></div></body></html>
  `;

  it('中间目录页从 c-pager 的「次へ」链接取下一页', () => {
    const html = contentsPage(2, false, ['第百話「始まり」']);
    expect(scraper.exposeNext(html, `${baseUrl}?p=2`)).toBe(`${baseUrl}?p=3`);
  });

  it('末页章节标题含「次の」时不把章节当成下一页', () => {
    const html = contentsPage(3, true, [
      '第百九十八話「干し肉殺人事件」',
      '第百九十九話「次の戦い」',
    ]);
    expect(scraper.exposeNext(html, `${baseUrl}?p=3`)).toBeNull();
  });

  it('末页章节标题含「次へ」或「Next」时不把章节当成下一页', () => {
    const html = contentsPage(3, true, ['次へ進む者たち', 'Next Stage']);
    expect(scraper.exposeNext(html, `${baseUrl}?p=3`)).toBeNull();
  });

  it('只有一页的目录里章节标题含「次の」时没有下一页', () => {
    const html = contentsPage(1, true, ['次の朝']);
    expect(scraper.exposeNext(html, baseUrl)).toBeNull();
  });

  it('下一页链接指向章节而非目录页时忽略', () => {
    const html = `<html><body><a rel="next" href="/n2032iz/218/">次へ</a></body></html>`;
    expect(scraper.exposeNext(html, `${baseUrl}?p=3`)).toBeNull();
  });

  it('末页解析结果不带后续目录页', () => {
    const html = contentsPage(3, true, ['第百九十九話「次の戦い」']);
    expect(scraper.parseNovelSnapshot(html, `${baseUrl}?p=3`).nextPageUrls).toEqual([]);
  });

  it('falls back to smallest page > current when no explicit next', () => {
    const html = `
      <html><body>
        <div class="p-eplist__pager">
          <a href="?p=2">2</a>
          <a href="?p=3">3</a>
          <a href="?p=5">5</a>
        </div>
      </body></html>
    `;
    const next = scraper.exposeNext(html, `${baseUrl}?p=2`);
    expect(next).toBe(`${baseUrl}?p=3`);
  });
});
