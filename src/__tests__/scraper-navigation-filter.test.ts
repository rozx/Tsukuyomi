import { describe, it, expect } from 'vitest';
import { KakuyomuScraper } from '../services/scraper/scrapers/kakuyomu-scraper';
import { SyosetuScraper } from '../services/scraper/scrapers/syosetu-scraper';

/**
 * 导航文本过滤回归：正文中含「お前の話」「目次」「次へ」等子串的段落不能被当成导航丢弃，
 * 只有整段都是导航标签（如「前の話」「目次」「次へ >>」）时才跳过。
 */

class ExposedKakuyomuScraper extends KakuyomuScraper {
  extract(html: string): string[] {
    return this.extractParagraphsFromHtml(html);
  }
}

class ExposedSyosetuScraper extends SyosetuScraper {
  extract(html: string): string[] {
    return this.extractParagraphsFromHtml(html);
  }
}

const BODY_LINES = [
  '「お前の話を聞いて、少し安心したよ」',
  '彼は目次をめくりながら答えた。',
  '「次へ進もう。前へ出るんだ」',
  '「1 >> 2 になるってこと？」',
];

describe('KakuyomuScraper 导航文本过滤', () => {
  const scraper = new ExposedKakuyomuScraper();

  it('保留含导航词子串的正文段落', () => {
    const html = `<div class="widget-episodeBody">${BODY_LINES.map(
      (line, i) => `<p id="p${i + 1}">${line}</p>`,
    ).join('')}</div>`;

    expect(scraper.extract(html)).toEqual([BODY_LINES.join('\n')]);
  });

  it('仍然跳过整段只有导航标签的段落', () => {
    const html = `<div class="widget-episodeBody">
      <p id="p1">本文その一</p>
      <p id="p2">前の話</p>
      <p id="p3">目次</p>
      <p id="p4">次の話 &gt;&gt;</p>
      <p id="p5">&lt;&lt; 前へ ｜ 次へ &gt;&gt;</p>
      <p id="p6">本文その二</p>
    </div>`;

    expect(scraper.extract(html)).toEqual(['本文その一\n本文その二']);
  });
});

describe('SyosetuScraper 导航文本过滤', () => {
  const scraper = new ExposedSyosetuScraper();

  it('保留含导航词子串的正文段落', () => {
    const html = `<div id="honbun">${BODY_LINES.map((line, i) => `<p id="${i}">${line}</p>`).join(
      '',
    )}</div>`;

    expect(scraper.extract(html).map((p) => p.trim())).toEqual(BODY_LINES);
  });

  it('仍然跳过整段只有导航标签的段落', () => {
    const html = `<div id="honbun">
      <p id="0">本文その一</p>
      <p id="1">前の話\u3000目次\u3000次の話</p>
      <p id="2">本文その二</p>
    </div>`;

    expect(scraper.extract(html).map((p) => p.trim())).toEqual(['本文その一', '本文その二']);
  });

  it('无 <p> 兜底提取时保留含导航词子串的行', () => {
    const html = `<div id="honbun">${BODY_LINES.join('<br>')}<br>目次</div>`;

    expect(scraper.extract(html).map((p) => p.trim())).toEqual(BODY_LINES);
  });
});
