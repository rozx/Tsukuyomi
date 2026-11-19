import type { Chapter, Paragraph, Volume } from 'src/models/novel';
import { generateShortId } from 'src/utils/id-generator';
import { resolveDefaultVolumeTitle } from './helpers';

export function splitTextToParagraphLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

export function buildParagraphs(lines: string[]): Paragraph[] {
  return lines.map((text) => ({
    id: generateShortId(),
    text,
    selectedTranslationId: '',
    translations: [],
  }));
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
