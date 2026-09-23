import type { ImportContentRef, ImportDraftChapter } from 'src/models/import';
import type { ImportDraftBatchInput, ImportDraftBatchSummary } from 'src/models/import-draft-batch';
import { ImportContentService } from './import-content-service';
import { ImportLibraryReader } from './import-library-reader';
import { excludeImportText, extendImportExclusions } from './import-content-exclusions';
import type { ImportParsingClient } from './import-parsing-client';
import { IMPORT_PARSE_LIMITS } from './import-work-limits';
import type { ImportBookSnapshots } from './import-draft-validation';

export async function draftReferenceText(
  taskId: string,
  ref: ImportContentRef,
  books: ImportBookSnapshots,
): Promise<string> {
  if (ref.kind === 'extraction')
    return ImportContentService.resolve(taskId, { ...ref, excludeRanges: [] });
  if (!books.has(ref.bookId)) books.set(ref.bookId, await ImportLibraryReader.readBook(ref.bookId));
  const book = books.get(ref.bookId);
  if (book?.kind !== 'loaded' || book.revision !== ref.bookRevision)
    throw new Error('BOOK_CHANGED: 既有正文引用已过时或无法读取');
  const chapter = book.chapters[ref.chapterId];
  const paragraph =
    chapter?.kind === 'loaded' && chapter.content.find((p) => p.id === ref.paragraphId);
  if (!paragraph) throw new Error('CHAPTER_READ_FAILED: 既有正文无法读取');
  return paragraph.text;
}

export async function cleanDraftChapters(
  taskId: string,
  chapters: ImportDraftChapter[],
  input: ImportDraftBatchInput,
  parser: ImportParsingClient,
  signal?: AbortSignal,
) {
  const books: ImportBookSnapshots = new Map();
  const entries: { chapterId: string; ref: ImportContentRef; original: string; text: string }[] =
    [];
  let characters = 0;
  for (const chapter of chapters) {
    if (chapter.status !== 'ready')
      throw new Error('CHAPTER_NOT_READY: 正文清理只接受已就绪章节，请缩小范围');
    for (const ref of chapter.content) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      const original = await draftReferenceText(taskId, ref, books);
      characters += original.length;
      if (characters > IMPORT_PARSE_LIMITS.textCharacters || entries.length >= 10000)
        throw new Error('PROCESSING_LIMIT: 批量正文过多，请缩小范围');
      entries.push({
        chapterId: chapter.id,
        ref,
        original,
        text: excludeImportText(original, ref.excludeRanges),
      });
    }
  }
  const { value } = await parser.run(
    {
      kind: 'pattern',
      texts: entries.map((e) => e.text),
      pattern: input.pattern,
      action: input.action,
    },
    { ...(signal ? { signal } : {}) },
  );
  const updates = new Map<string, ImportContentRef[]>();
  const changed = new Set<string>();
  const nonEmpty = new Set<string>();
  const examples: ImportDraftBatchSummary['examples'] = [];
  let matches = 0;
  entries.forEach((entry, index) => {
    const result = value[index]!;
    matches += result.matches;
    if (result.text.trim()) nonEmpty.add(entry.chapterId);
    const refs = updates.get(entry.chapterId) ?? [];
    if (result.matches) {
      changed.add(entry.chapterId);
      refs.push({
        ...entry.ref,
        excludeRanges: extendImportExclusions(
          entry.original,
          entry.ref.excludeRanges,
          result.ranges,
        ),
      });
      if (examples.length < 5) {
        const start = Math.max(0, (result.ranges[0]?.start ?? 0) - 60);
        examples.push({
          id: entry.chapterId,
          before: entry.text.slice(start, start + 240),
          after: result.text.slice(start, start + 240),
        });
      }
    } else refs.push(entry.ref);
    updates.set(entry.chapterId, refs);
  });
  for (const id of changed)
    if (!nonEmpty.has(id))
      throw new Error('EMPTY_CONTENT: 规则会清空整章，请调整规则或使用删除章节');
  return {
    chapters: chapters
      .filter((c) => changed.has(c.id))
      .map((c) => ({ ...c, content: updates.get(c.id)! })),
    matches,
    examples,
  };
}
