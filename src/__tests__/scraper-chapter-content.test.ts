import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import './setup';
import axios from 'axios';
import { NovelScraperFactory } from '../services/scraper/novel-scraper-factory';

async function fetchContent(url: string, html: string): Promise<string> {
  spyOn(axios, 'get').mockResolvedValue({
    status: 200,
    data: html,
    headers: { 'content-type': 'text/html' },
  });
  const scraper = NovelScraperFactory.getScraper(url);
  if (!scraper) throw new Error(`测试站点没有对应的爬虫：${url}`);
  return scraper.fetchChapterContent(url);
}

afterEach(() => {
  mock.restore();
});

for (const host of ['ncode.syosetu.com', 'novel18.syosetu.com']) {
  describe(`${host} 章节完整性`, () => {
    const url = `https://${host}/n2032iz/3/`;

    it('有前言时按顺序保留前言、完整正文和后记', async () => {
      const content = await fetchContent(
        url,
        `<div class="l-container"><main><article><div class="p-novel__body">
          <div class="js-novel-text p-novel__text p-novel__text--preface">
            <p id="Lp1">作者前言</p>
          </div>
          <div class="js-novel-text p-novel__text">
            <p id="L1">正文开头</p><p id="L2"><br></p>
            <p id="L3">正文结尾<br>续行</p>
          </div>
          <div class="js-novel-text p-novel__text p-novel__text--afterword">
            <p id="La1">作者后记</p>
          </div>
        </div></article></main></div>`,
      );

      expect(content).toBe('作者前言\n\n---\n\n正文开头\n\n正文结尾\n续行\n\n---\n\n作者后记\n');
    });

    for (const { name, preface, afterword, expected } of [
      { name: '只有正文', preface: '', afterword: '', expected: '正文\n' },
      { name: '前言和正文', preface: '前言', afterword: '', expected: '前言\n\n---\n\n正文\n' },
      { name: '正文和后记', preface: '', afterword: '后记', expected: '正文\n\n---\n\n后记\n' },
    ]) {
      it(`${name}时不重复内容，也不为空留言生成分隔符`, async () => {
        const content = await fetchContent(
          url,
          `<div class="p-novel__body">
            <div class="p-novel__text p-novel__text--preface"><p>${preface}</p></div>
            <div class="p-novel__text"><p>正文</p></div>
            <div class="p-novel__text p-novel__text--afterword"><p>${afterword}</p></div>
          </div>`,
        );

        expect(content).toBe(expected);
      });
    }

    it('正文被分隔线和广告分成多个区块时仍完整提取', async () => {
      const content = await fetchContent(
        url,
        `<div class="p-novel__body">
          <div class="ad"><p>开头广告</p></div>
          <div class="p-novel__text"><div><p>正文开头</p><p><br></p></div></div>
          <hr><div class="ad"><p>中间广告</p></div>
          <div class="p-novel__text">
            <div><p>分隔线后正文<br>续行</p></div>
            <script>广告脚本</script><div class="ad"><p>内嵌广告</p></div>
            <p>正文结尾</p>
          </div>
        </div>`,
      );

      expect(content).toBe('正文开头\n\n分隔线后正文\n续行\n正文结尾\n');
    });

    it('前言之后没有 p 标签的正文仍保留缩进和换行', async () => {
      const content = await fetchContent(
        url,
        `<div class="p-novel__body">
          <div class="p-novel__text p-novel__text--preface">前言</div>
          <div class="p-novel__text">\u3000正文开头<br>正文结尾</div>
        </div>`,
      );

      expect(content).toBe('前言\n\n---\n\n　正文开头\n正文结尾\n');
    });

    for (const body of ['', '<div class="p-novel__text"><p><br></p></div>']) {
      it(`正文${body ? '为空' : '缺失'}时不把作者留言当作成功抓取`, async () => {
        const result = await fetchContent(
          url,
          `<div class="p-novel__body">
              <div class="p-novel__text p-novel__text--preface"><p>前言</p></div>
              ${body}
              <div class="p-novel__text p-novel__text--afterword"><p>后记</p></div>
            </div>`,
        ).catch((error: unknown) => error);

        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toBe('无法找到章节正文内容');
      });
    }
  });
}

describe('其他站点章节完整性', () => {
  for (const bodyClass of ['widget-episodeBody', 'episodeBody']) {
    it(`Kakuyomu 的 ${bodyClass} 保留分隔线两侧及嵌套区块中的全部正文`, async () => {
      const content = await fetchContent(
        'https://kakuyomu.jp/works/822139842947212336/episodes/822139842947254251',
        `<main>
        <header><p>章节标题</p></header>
        <div class="${bodyClass} js-episode-body">
          <div><p>正文开头</p></div><p class="blank"><br></p><hr>
          <div><p>分隔线后正文<br>续行</p><p>正文结尾</p></div>
        </div>
        <footer><p>页面导航</p></footer>
      </main>`,
      );

      expect(content).toBe('正文开头\n\n分隔线后正文\n续行\n正文结尾');
    });
  }

  for (const bodyAttribute of [
    'id="honbun"',
    'id="novel_honbun"',
    'class="novel_honbun"',
    'id="novel_content"',
    'class="novel_content"',
  ]) {
    it(`syosetu.org 使用 ${bodyAttribute} 正文容器，不被前面的留言区块遮蔽`, async () => {
      const content = await fetchContent(
        'https://syosetu.org/novel/375522/1.html',
        `<div class="ss"><p>作者前言</p></div>
        <div class="ss"><div ${bodyAttribute}>
          <div><p>正文开头</p><p></p></div><hr>
          <div><p>分隔线后正文<br>续行</p><p>正文结尾</p></div>
        </div></div>
        <div class="ss"><p>页面导航</p></div>`,
      );

      expect(content).toBe('正文开头\n\n分隔线后正文\n续行\n正文结尾\n');
    });
  }
});
