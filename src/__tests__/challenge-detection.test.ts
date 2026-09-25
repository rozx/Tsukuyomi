import { describe, expect, it } from 'vitest';
import { isChallengePage } from 'src/services/scraper/core/challenge-detection';

/** 结构仿照 Cloudflare 托管质询页（文本为合成内容） */
const CLOUDFLARE_JUST_A_MOMENT = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<meta http-equiv="refresh" content="390"></head><body><div class="main-wrapper" role="main">
<noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript>
</div><script>(function(){window._cf_chl_opt={cvId: '3',cZone: 'syosetu.org',cType: 'managed'};
var cpo=document.createElement('script');cpo.src='/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=abc';
document.getElementsByTagName('head')[0].appendChild(cpo);}());</script></body></html>`;

const CLOUDFLARE_JUST_A_MOMENT_JA = `<!DOCTYPE html><html lang="ja-JP"><head><title>しばらくお待ちください...</title></head>
<body><script>window._cf_chl_opt={cType: 'managed'};</script></body></html>`;

const CLOUDFLARE_ATTENTION_REQUIRED = `<!DOCTYPE html><html><head>
<title>Attention Required! | Cloudflare</title></head><body>
<div id="cf-wrapper"><h1>Sorry, you have been blocked</h1></div></body></html>`;

const CLOUDFLARE_BROWSER_VERIFICATION = `<html><head><title>syosetu.org</title></head><body>
<div id="cf-browser-verification" class="cf-browser-verification cf-im-under-attack">
<noscript>Please turn JavaScript on and reload the page.</noscript></div></body></html>`;

/** 合成的普通章节页：正文里出现 challenge 字样，且站点注入了 Cloudflare JS 检测脚本 */
const ORDINARY_CHAPTER_WITH_JSD = `<!DOCTYPE html><html lang="ja"><head>
<title>第6話 - テスト小説 - ハーメルン</title></head><body>
<div id="honbun"><p id="1">彼は新たな challenge に挑む。</p><p id="2">Just a moment, he said.</p></div>
<script>(function(){var a=document.createElement('script');
a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.body.appendChild(a);})();</script>
</body></html>`;

const ORDINARY_KAKUYOMU_TOC = `<!DOCTYPE html><html lang="ja"><head><title>テスト作品 - カクヨム</title>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"title":"Challenge Accepted"}}}</script>
</head><body><main>目次</main></body></html>`;

describe('isChallengePage', () => {
  it.each([
    ['Cloudflare Just a moment', CLOUDFLARE_JUST_A_MOMENT],
    ['Cloudflare 日文质询标题', CLOUDFLARE_JUST_A_MOMENT_JA],
    ['Cloudflare Attention Required', CLOUDFLARE_ATTENTION_REQUIRED],
    ['Cloudflare 浏览器校验容器', CLOUDFLARE_BROWSER_VERIFICATION],
  ])('识别质询页：%s', (_name, html) => {
    expect(isChallengePage(html)).toBe(true);
  });

  it('正文含 challenge / Just a moment 字样且注入 JS 检测脚本的普通章节页不误判', () => {
    expect(isChallengePage(ORDINARY_CHAPTER_WITH_JSD)).toBe(false);
  });

  it('kakuyomu 普通目录页不误判', () => {
    expect(isChallengePage(ORDINARY_KAKUYOMU_TOC)).toBe(false);
  });

  it('空字符串不是质询页', () => {
    expect(isChallengePage('')).toBe(false);
  });
});
