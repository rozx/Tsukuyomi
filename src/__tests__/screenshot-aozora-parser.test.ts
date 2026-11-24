import { describe, expect, it } from 'vitest';
import { parseAozoraHtml } from '../../scripts/screenshots/aozora';

const wrap = (body: string) =>
  `<html><body><h1 class="title">作品</h1><div class="main_text">${body}</div>` +
  '<div class="bibliographical_information">底本：全集<br />入力：某某</div></body></html>';

describe('parseAozoraHtml（截图演示书库的原文解析）', () => {
  it('没有标题的作品归入单卷单章，每行一个段落', () => {
    const volumes = parseAozoraHtml(wrap('　一行目です。<br />\n「二行目」<br />\n'));
    expect(volumes).toEqual([
      { title: null, chapters: [{ title: '本文', paragraphs: ['一行目です。', '「二行目」'] }] },
    ]);
  });

  it('中标题拆成章节，注音只保留正文字', () => {
    const volumes = parseAozoraHtml(
      wrap(
        '<div class="jisage_3"><h4 class="naka-midashi"><a class="midashi_anchor" id="m1">一、' +
          '<ruby><rb>午后</rb><rp>（</rp><rt>ごご</rt><rp>）</rp></ruby>の授業</a></h4></div><br />' +
          '銀河を<ruby><rb>指</rb><rp>（</rp><rt>さ</rt><rp>）</rp></ruby>しました。<br />' +
          '<h4 class="naka-midashi">二、活版所</h4><br />　活字を拾う。<br />',
      ),
    );
    expect(volumes).toHaveLength(1);
    expect(volumes[0]?.chapters).toEqual([
      { title: '一、午后の授業', paragraphs: ['銀河を指しました。'] },
      { title: '二、活版所', paragraphs: ['活字を拾う。'] },
    ]);
  });

  it('大标题拆成卷，卷内没有小标题时用卷名作章名', () => {
    const volumes = parseAozoraHtml(
      wrap(
        '<h3 class="o-midashi">はしがき</h3><br />前書き。<br />' +
          '<h3 class="o-midashi">第一の手記</h3><br /><h4 class="naka-midashi">一</h4>本文。<br />',
      ),
    );
    expect(volumes).toEqual([
      { title: 'はしがき', chapters: [{ title: 'はしがき', paragraphs: ['前書き。'] }] },
      { title: '第一の手記', chapters: [{ title: '一', paragraphs: ['本文。'] }] },
    ]);
  });

  it('去掉外字图片、还原实体，并且不把底本信息当成正文', () => {
    const volumes = parseAozoraHtml(
      wrap('A &amp; B<img src="g.png" class="gaiji" alt="※" />と&lt;C&gt;<br />'),
    );
    expect(volumes[0]?.chapters[0]?.paragraphs).toEqual(['A & Bと<C>']);
  });

  it('只有空行或空章节时返回空数组', () => {
    expect(parseAozoraHtml(wrap('<br />\n　<br /><h4 class="naka-midashi">一</h4><br />'))).toEqual(
      [],
    );
  });
});
