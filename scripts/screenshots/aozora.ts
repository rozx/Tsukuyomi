import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';

/**
 * 截图用的演示书库原文取自青空文库（作者均已进入公有领域）。
 * 原文不放进仓库：首次运行时下载并缓存到 node_modules/.cache/tsukuyomi-screenshots。
 */

export interface AozoraChapter {
  title: string;
  paragraphs: string[];
}

export interface AozoraVolume {
  /** 作品没有分部时为 null */
  title: string | null;
  chapters: AozoraChapter[];
}

const AOZORA_BASE = 'https://www.aozora.gr.jp/cards/';
const VOLUME_MARK = '@@VOL ';
const CHAPTER_MARK = '@@CH ';

/** 把青空文库的 XHTML 正文拆成卷 / 章 / 段落，注音只保留正文字 */
export function parseAozoraHtml(html: string): AozoraVolume[] {
  const $ = load(html);
  const main = $('.main_text').first();
  // 注音读法、注音括号和外字图片不属于正文
  main.find('rt, rp, img').remove();
  // 标题换成带标记的独立行，稍后按行切分卷和章
  main.find('h3.o-midashi').each((_, heading) => {
    $(heading).text(`\n${VOLUME_MARK}${$(heading).text().trim()}\n`);
  });
  main.find('h4, h5').each((_, heading) => {
    $(heading).text(`\n${CHAPTER_MARK}${$(heading).text().trim()}\n`);
  });
  main.find('br').replaceWith('\n');

  const volumes: AozoraVolume[] = [];
  let volume: AozoraVolume | undefined;
  let chapter: AozoraChapter | undefined;
  const startChapter = (title: string) => {
    if (!volume) {
      volume = { title: null, chapters: [] };
      volumes.push(volume);
    }
    chapter = { title, paragraphs: [] };
    volume.chapters.push(chapter);
  };

  for (const raw of main.text().split('\n')) {
    const line = raw.trim().replace(/^\u3000+|\u3000+$/g, '');
    if (!line) continue;
    if (line.startsWith(VOLUME_MARK)) {
      volume = { title: line.slice(VOLUME_MARK.length), chapters: [] };
      volumes.push(volume);
      chapter = undefined;
    } else if (line.startsWith(CHAPTER_MARK)) {
      startChapter(line.slice(CHAPTER_MARK.length));
    } else {
      if (!chapter) startChapter(volume?.title ?? '本文');
      chapter!.paragraphs.push(line);
    }
  }

  return volumes
    .map((item) => ({
      ...item,
      chapters: item.chapters.filter((value) => value.paragraphs.length > 0),
    }))
    .filter((item) => item.chapters.length > 0);
}

/** 下载（或读取缓存的）青空文库作品，path 形如 `000081/files/456_15050.html` */
export async function loadAozoraWork(path: string, cacheDir: string): Promise<AozoraVolume[]> {
  await mkdir(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, path.replace(/\//g, '_'));
  let bytes: Uint8Array;
  try {
    bytes = await readFile(cacheFile);
  } catch {
    const response = await fetch(AOZORA_BASE + path);
    if (!response.ok) throw new Error(`青空文库下载失败（${response.status}）：${path}`);
    bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(cacheFile, bytes);
  }
  const volumes = parseAozoraHtml(new TextDecoder('shift_jis').decode(bytes));
  if (volumes.length === 0) throw new Error(`青空文库正文解析为空：${path}`);
  return volumes;
}
