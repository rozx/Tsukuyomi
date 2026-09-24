import { afterEach, describe, it, mock, spyOn } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { parseImportHtml } from '../services/import/import-html-parser';

afterEach(() => mock.restore());

describe('快照上的 HTML / XHTML 提取', () => {
  it('空段落保留为有原始范围的空白块，不因没有文本而消失', () => {
    const html = '<article><p>第一段</p><p></p><p>第二段</p></article>';
    const parsed = parseImportHtml(html);
    expect(parsed.blocks.map((block) => block.text).join('\n')).toBe('第一段\n\n第二段');
    const blank = parsed.blocks.find((block) => block.kind === 'whitespace');
    expect(blank).toBeDefined();
    expect(html.slice(blank!.start, blank!.end)).toBe('<p></p>');
  });
  it('复用站点范围，保留前言、正文和后记，分别记录导航广告和时间排除', () => {
    const html =
      '<html><head><meta name="author" content="作者"><meta property="og:title" content="小说"></head><body><div class="p-novel__body"><div class="p-novel__text p-novel__text--preface"><p>前言</p></div><div class="p-novel__text"><time>2026-01-01</time><p>　正文&amp;符号<br>换行</p><aside class="ad">广告</aside><nav>下一章</nav></div><div class="p-novel__text p-novel__text--afterword"><p>后记</p></div></div></body></html>';
    const result = parseImportHtml(html);
    expect(result.metadata).toMatchObject({ title: '小说', author: '作者' });
    expect(
      result.blocks.filter((b) => b.kind !== 'whitespace').map((b) => [b.kind, b.text]),
    ).toEqual([
      ['preface', '前言'],
      ['body', '　正文&符号\n换行'],
      ['afterword', '后记'],
    ]);
    expect(result.excluded.map((b) => b.text)).toEqual(
      expect.arrayContaining([
        '<time>2026-01-01</time>',
        '<aside class="ad">广告</aside>',
        '<nav>下一章</nav>',
      ]),
    );
    expect(result.blocks.every((b) => b.start >= 0 && b.end <= html.length && b.locator)).toBe(
      true,
    );
  });

  it('未知页面支持 CSS 范围、排除规则和原始定位，重复文本位置不同', () => {
    const html =
      '<main><h1>章名</h1><section class="story"><p>相同正文</p><div class="recommend">杂质</div><p>相同正文</p><div class="ambiguous">无法判断的注释</div></section></main>';
    const result = parseImportHtml(html, { selector: '.story', excludeSelectors: ['.recommend'] });
    expect(result.blocks.map((b) => b.text)).toEqual(['相同正文', '相同正文', '无法判断的注释']);
    expect(result.blocks[0]?.start).not.toBe(result.blocks[1]?.start);
    expect(result.excluded[0]?.reason).toContain('.recommend');
    for (const block of result.blocks)
      expect(html.slice(block.start, block.end)).toContain(block.text);
    expect(() => parseImportHtml(html, { selector: '[:broken' })).toThrow('INVALID_SELECTOR');
  });

  it('节点嵌套和正文容器中的直接文本不会丢失或重复，外部资源不请求', () => {
    const request = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('不应请求'));
    const html =
      '<article>前置文字<p>段落<em>强调</em></p>尾部文字<div><p>嵌套正文</p></div><script>fetch("https://evil.example")</script><img src="https://evil.example/pixel"></article>';
    const result = parseImportHtml(html, { selector: 'article, article div' });
    expect(result.blocks.map((b) => b.text).join('|')).toBe('前置文字|段落强调|尾部文字|嵌套正文');
    expect(request).not.toHaveBeenCalled();
    expect(result.excluded.some((b) => b.reason.includes('script'))).toBe(true);
  });

  it('只返回链接与实际封面地址，保留相对路径语义及查询参数，不跟页', () => {
    const result = parseImportHtml(
      '<html><head><meta property="og:image" content="../cover.jpg?v=2"></head><body><nav class="toc"><a href="ch1.html#p1">第一章</a><a rel="next" href="?page=2">下一页</a><a href="javascript:alert(1)">坏链接</a><a href="data:text/html,x">数据链接</a><a href="vbscript:msgbox(1)">脚本链接</a></nav></body></html>',
      {},
      'https://example.com/book/index.html',
    );
    expect(result.kind).toBe('catalog');
    expect(result.metadata.cover).toBe('https://example.com/cover.jpg?v=2');
    expect(result.links).toEqual(
      expect.arrayContaining([
        { name: '第一章', href: 'https://example.com/book/ch1.html#p1', relation: 'chapter' },
        { name: '下一页', href: 'https://example.com/book/index.html?page=2', relation: 'next' },
      ]),
    );
    expect(
      result.links.every((link) => ['http:', 'https:'].includes(new URL(link.href).protocol)),
    ).toBe(true);
  });

  it('登录、验证、动态空壳和版权页均不能被当成成功正文', () => {
    expect(
      parseImportHtml(
        '<html><title>ログイン</title><body><form><input type="password">请登录</form></body></html>',
      ).kind,
    ).toBe('verification');
    expect(
      parseImportHtml('<html><title>年齢確認</title><body><a id="yes18">確認</a></body></html>')
        .kind,
    ).toBe('verification');
    expect(parseImportHtml('<div id="app"></div><script src="/render.js"></script>').kind).toBe(
      'dynamic',
    );
    const copyright = parseImportHtml(
      '<html><body><section epub:type="copyright-page"><h1>版权</h1><p>All rights reserved</p></section></body></html>',
    );
    expect(copyright.kind).toBe('copyright');
    expect(copyright.blocks).toEqual([]);
  });

  it('正文含登录词语不误判，脚注默认保留，规则排空返回 empty', () => {
    const html =
      '<article><p>他点击登录，然后出发。</p><aside epub:type="footnote">原始注释</aside></article>';
    const result = parseImportHtml(html);
    expect(result.kind).toBe('content');
    expect(result.blocks.some((b) => b.kind === 'note' && b.text === '原始注释')).toBe(true);
    expect(parseImportHtml(html, { selector: '.missing' }).kind).toBe('empty');
  });
});
