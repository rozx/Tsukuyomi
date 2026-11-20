import type { Chapter, Paragraph, Volume } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';
import { generateShortId } from 'src/utils/id-generator';
import { resolveDefaultVolumeTitle } from './helpers';

/**
 * 把章节正文转成段落。与站内导入用同一个转换（ChapterService.convertContentToParagraphs）：
 * 每一行是一个段落，空行、行首缩进与行尾空白都原样保留。Windows 换行按一行处理。
 */
export function textToParagraphs(text: string): Paragraph[] {
  return ChapterService.convertContentToParagraphs(text.replace(/\r\n?/g, '\n'));
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
