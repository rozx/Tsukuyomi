import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

function stripTags(html: string): string {
  return html
    .replace(/<ruby><rb>(.*?)<\/rb>.*?<\/ruby>/gs, '$1')
    .replace(/<img[^>]*class="gaiji"[^>]*>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '');
}

/** 把青空文库的 XHTML 正文拆成卷 / 章 / 段落，注音只保留正文字 */
export function parseAozoraHtml(html: string): AozoraVolume[] {
  const mainStart = html.indexOf('class="main_text"');
  const bodyStart = html.indexOf('>', mainStart) + 1;
  const bodyEnd = html.indexOf('<div class="bibliographical_information"');
  const marked = html
    .slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
    .replace(
      /<h3 class="o-midashi">(.*?)<\/h3>/gs,
      (_, title: string) => `\n@@VOL ${stripTags(title).trim()}\n`,
    )
    .replace(
      /<h[45][^>]*>(.*?)<\/h[45]>/gs,
      (_, title: string) => `\n@@CH ${stripTags(title).trim()}\n`,
    )
    .replace(/<br \/>/g, '\n');

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

  for (const raw of stripTags(marked).split('\n')) {
    const line = raw.trim().replace(/^\u3000+|\u3000+$/g, '');
    if (!line) continue;
    if (line.startsWith('@@VOL ')) {
      volume = { title: line.slice(6), chapters: [] };
      volumes.push(volume);
      chapter = undefined;
    } else if (line.startsWith('@@CH ')) {
      startChapter(line.slice(5));
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
