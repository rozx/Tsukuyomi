import type { Chapter, Paragraph, Volume } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';
import { generateShortId } from 'src/utils/id-generator';
import { resolveDefaultVolumeTitle } from './helpers';

/**
 * 把章节正文转成段落。与站内导入用同一个转换（ChapterService.convertContentToParagraphs）：
 * 每一行是一个段落，空行、行首缩进与行尾空白都原样保留。Windows 换行按一行处理。
 */
export function textToParagraphs(text: string): Paragraph[] {
  // 没有任何文字的正文不产生段落：章节保持「空」，之后从网址导入时才会去补正文
  if (!text.trim()) return [];
  return ChapterService.convertContentToParagraphs(text.replace(/\r\n?/g, '\n'));
}

/**
 * 读取来源网址。界面会把它渲染成链接，导入时还会去请求它，所以只接受 http / https。
 * 没有填写时 url 为空字符串；填了但不是 http(s) 网址时 ok 为 false。
 */
export function readSourceUrl(value: unknown): { ok: true; url: string } | { ok: false } {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { ok: true, url: '' };
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:' ? { ok: true, url: raw } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** 调用方已经分好段时逐条作为段落，同样不做修剪，空字符串即空行 */
export function linesToParagraphs(lines: readonly string[]): Paragraph[] {
  return textToParagraphs(lines.join('\n'));
}

export function createEmptyVolume(title?: string, chapters: Chapter[] = []): Volume {
  const originalTitle = title && title.trim() ? title.trim() : resolveDefaultVolumeTitle();
  return {
    id: generateShortId(),
    title: {
      original: originalTitle,
      translation: { id: generateShortId(), translation: '', aiModelId: '' },
    },
    chapters,
  };
}

export function countChaptersInVolumes(volumes: readonly Volume[] | undefined): number {
  return (volumes ?? []).reduce((sum, v) => sum + (v.chapters?.length ?? 0), 0);
}
