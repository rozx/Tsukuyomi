import { File } from 'node:buffer';
import { ImportRepository } from '../services/import/import-repository';
import { ImportSourceService } from '../services/import/import-source-service';
import { ImportExtractionService } from '../services/import/import-extraction-service';
import { ImportParsingClient } from '../services/import/import-parsing-client';
import { ImportDraftService } from '../services/import/import-draft-service';
import type { Novel, Paragraph } from '../models/novel';
import type { ImportContentRef, ImportDraftChapter } from '../models/import';

const date = new Date('2026-01-01T00:00:00Z');
export function paragraph(id: string, text: string, count = 1): Paragraph {
  return {
    id,
    text,
    translations: Array.from({ length: count }, (_, i) => ({
      id: `${id}-t${i}`,
      translation: `译文${i}`,
      aiModelId: 'm',
    })),
    selectedTranslationId: count ? `${id}-t0` : '',
  };
}
export function book(): Novel {
  return {
    id: 'book',
    title: '原书',
    author: '作者',
    createdAt: date,
    lastEdited: date,
    notes: [],
    translationInstructions: '必须保留的设置',
    volumes: [
      {
        id: 'old-v',
        title: '旧卷',
        chapters: [
          {
            id: 'old-c',
            title: '原章',
            createdAt: date,
            lastEdited: date,
            content: [
              paragraph('p1', '原文甲', 2),
              paragraph('p2', '锚点'),
              paragraph('p3', '原文乙', 3),
            ],
          },
          {
            id: 'missing-c',
            title: '来源缺席的旧章',
            createdAt: date,
            lastEdited: date,
            content: [paragraph('untouched', '不能删除')],
          },
        ],
      },
    ],
  };
}

export async function draft(text: string) {
  const task = await ImportRepository.createTask();
  const [source] = await ImportSourceService.registerFiles(task.id, [
    new File([text], 'novel.txt'),
  ]);
  const parsed = await new ImportExtractionService(
    new ImportParsingClient(() => undefined),
  ).prepareExtraction(task.id, [{ sourceId: source!.id }]);
  await ImportRepository.saveStep(task.id, parsed);
  const ref: ImportContentRef = { kind: 'extraction', resourceId: parsed.results[0]!.contentId! };
  const chapter: ImportDraftChapter = {
    id: 'draft-c',
    title: '原章',
    volumeId: 'draft-v',
    content: [ref],
    sourceIds: [],
    selected: true,
    status: 'ready',
    inferredTitle: true,
    inferredStructure: true,
  };
  await ImportDraftService.edit(task.id, {
    baseDraftRevision: 0,
    operations: [
      {
        op: 'declare_candidates',
        candidates: [{ id: 'n', title: '小说', sourceIds: [source!.id] }],
      },
      { op: 'upsert_volume', id: 'draft-v', title: '卷一' },
      { op: 'upsert_chapter', chapter },
    ],
  });
  return { taskId: task.id, source: source!, chapter, ref };
}
