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
