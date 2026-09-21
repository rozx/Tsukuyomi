import type { ImportContentRef, ImportDraftChapter } from 'src/models/import';
import type { ImportNewParagraph } from 'src/models/import-matching';
import { hashJson } from 'src/utils/content-hash';
import type { UniqueIdGenerator } from 'src/utils/id-generator';
import { resolveImportSegments } from './import-content-references';
import type { ImportPlanContext } from './import-plan-context';

/** 换行转为既有 Paragraph 数组边界；正文字符、缩进及空行均保留。 */
export async function assembleImportParagraphs(
  context: ImportPlanContext,
  chapter: ImportDraftChapter,
  chapterId: string,
  ids: UniqueIdGenerator,
): Promise<ImportNewParagraph[]> {
  const output: ImportNewParagraph[] = [];
  let raw = '';
  let refs: ImportContentRef[] = [];
  const flush = async (final: boolean) => {
    if (!refs.length) return;
    const prefix = await hashJson(refs);
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    if (!final && lines.at(-1) === '') lines.pop();
    lines.forEach((text, index) =>
      output.push({
        key: JSON.stringify([chapter.id, prefix, index]),
        chapterId,
        newId: ids.generate(),
        text,
      }),
    );
    raw = '';
    refs = [];
  };
  for (const ref of chapter.content) {
    if (ref.kind === 'existing') {
      await flush(false);
      const loaded = context.snapshot?.chapters[ref.chapterId];
      const paragraph =
        loaded?.kind === 'loaded'
          ? loaded.content.find((entry) => entry.id === ref.paragraphId)
          : undefined;
      if (
        !paragraph ||
        ref.bookId !== context.snapshot?.book.id ||
        ref.bookRevision !== context.snapshot.revision
      )
        throw new Error('BOOK_CHANGED: 既有正文引用已过时');
      output.push({
        key: JSON.stringify([chapter.id, ref]),
        chapterId,
        newId: ids.generate(),
        text: paragraph.text,
        existing: { chapterId: ref.chapterId, paragraphId: ref.paragraphId },
      });
    } else {
      const resource = await context.resource(ref.resourceId);
      if (resource.kind !== 'extraction') throw new Error('INVALID_CONTENT_REF: 正文不是提取结果');
      const text = resolveImportSegments(resource, ref)
        .map((segment) => segment.text)
        .join(resource.separator ?? '\n');
      const previous = refs.at(-1);
      const adjacent =
        previous?.kind === 'extraction' &&
        previous.resourceId === ref.resourceId &&
        previous.blockId === ref.blockId &&
        previous.end === ref.start;
      if (refs.length && raw && !raw.endsWith('\n') && !text.startsWith('\n') && !adjacent)
        raw += '\n';
      raw += text;
      refs.push(ref);
    }
  }
  await flush(true);
  return output;
}
