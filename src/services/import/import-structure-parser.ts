import { importFailure, importError } from './import-error';
import { translateText } from 'src/i18n/translate';
import type { AppLocale } from 'src/models/locale';

import { parseImportMarkdown } from './import-text-parser';
import { selectStructureRange } from './import-structure-selection';
import type { ImportStructureJob, ImportStructureResult } from 'src/models/import-text-structure';
import type { ImportTextPattern } from 'src/models/import-pattern';
import { importExpression } from './import-expression';

interface Heading {
  start: number;
  end: number;
  title: string;
  kind: 'volume' | 'chapter';
}

function headings(text: string, pattern: ImportTextPattern, kind: Heading['kind']): Heading[] {
  const found: Heading[] = [];
  for (const match of text.matchAll(importExpression(pattern))) {
    if (!match[0].length)
      throw importError('EMPTY_MATCH', 'emptyMatchTitlesCannotMatchAnEmptyString', {});
    const start =
      Math.max(text.lastIndexOf('\n', match.index - 1), text.lastIndexOf('\r', match.index - 1)) +
      1;
    const end = match.index + match[0].length;
    const next = /\r\n|\r|\n/g;
    next.lastIndex = end;
    const newline = next.exec(text);
    const lineEnd = newline?.index ?? text.length;
    if (
      /\r|\n/.test(match[0]) ||
      text.slice(start, match.index).trim() ||
      text.slice(end, lineEnd).trim()
    )
      throw importError(
        'INVALID_BOUNDARY',
        'invalidBoundaryTitleRulesMustMatchStandaloneHeading',
        {},
      );
    const title = (match.groups?.title ?? match[0]).trim();
    found.push({ start, end: lineEnd + (newline?.[0].length ?? 0), title, kind });
    if (found.length > 1000)
      throw importError('PROCESSING_LIMIT', 'processingLimitTooManyHeadingMatchesReduceThe', {});
  }
  return found;
}

export function parseImportStructure(
  input: ImportStructureJob,
  uiLocale: AppLocale = 'zh-CN',
): ImportStructureResult {
  const { text, rules } = input;
  const selected = selectStructureRange(text, rules.selection);
  const boundaries = structureHeadings(input, selected).sort((a, b) => a.start - b.start);
  if (boundaries.some((h) => !h.title || h.title.length > 500))
    throw importError('INVALID_BOUNDARY', 'invalidBoundaryTitlesMustBeNonemptyAndAt', {});
  if (rules.mode !== 'single' && !boundaries.some((h) => h.kind === 'chapter'))
    throw importError('NO_CHAPTERS', 'noChaptersNoChapterHeadingsFoundAdjustThe', {});
  if (boundaries.some((h, i) => i > 0 && h.start < boundaries[i - 1]!.end))
    throw importError(
      'INVALID_BOUNDARY',
      'invalidBoundaryVolumeAndChapterHeadingRangesOverlap',
      {},
    );
  const result: ImportStructureResult = { volumes: [], chapters: [], excluded: [], selected };
  let volumeIndex = -1;
  if (selected.start)
    result.excluded.push({
      start: 0,
      end: selected.start,
      reason: importFailure('BEFORE_BODY', 'noticeBeforeBody'),
    });
  if (selected.end < text.length)
    result.excluded.push({
      start: selected.end,
      end: text.length,
      reason: importFailure('AFTER_BODY', 'noticeAfterBody'),
    });
  let cursor = selected.start;
  let active: Heading | undefined =
    rules.mode === 'single'
      ? {
          ...selected,
          title: translateText(uiLocale, 'aiImportErrors.defaultBody'),
          kind: 'chapter',
        }
      : undefined;
  const finish = (end: number) => {
    const bodyStart = active && rules.mode !== 'single' ? active.end : cursor;
    const body = text.slice(bodyStart, end);
    if (!active && !body.trim()) {
      if (end > cursor)
        result.excluded.push({
          start: cursor,
          end,
          reason: importFailure('HEADING_WHITESPACE', 'noticeHeadingWhitespace'),
        });
      return;
    }
    if (volumeIndex < 0) {
      volumeIndex = result.volumes.length;
      result.volumes.push({
        title: translateText(uiLocale, 'aiImportErrors.defaultVolume'),
        inferred: true,
      });
    }
    result.chapters.push({
      title: active?.title ?? translateText(uiLocale, 'aiImportErrors.defaultUnassigned'),
      volumeIndex,
      start: cursor,
      bodyStart,
      end,
      unassigned: !active,
      warnings: !body.trim()
        ? [importFailure('EMPTY_CHAPTER', 'noticeEmptyChapter')]
        : !active
          ? [importFailure('UNASSIGNED_CONTENT', 'noticeUnassigned')]
          : [],
    });
  };
  for (const heading of boundaries) {
    finish(heading.start);
    if (heading.kind === 'volume') {
      volumeIndex = result.volumes.length;
      result.volumes.push({ title: heading.title, inferred: false });
      active = undefined;
    } else active = heading;
    cursor = heading.kind === 'chapter' && rules.include_headings ? heading.start : heading.end;
    if (cursor === heading.end)
      result.excluded.push({
        start: heading.start,
        end: heading.end,
        reason:
          heading.kind === 'volume'
            ? importFailure('VOLUME_HEADING', 'noticeVolumeHeading')
            : importFailure('CHAPTER_HEADING', 'noticeChapterHeading'),
      });
  }
  finish(selected.end);
  addWarnings(text, result);
  if (result.chapters.length > 500)
    throw importError('PROCESSING_LIMIT', 'processingLimitEachBatchIsLimitedToChapters', {});
  return result;
}

function structureHeadings(
  input: ImportStructureJob,
  selected: { start: number; end: number },
): Heading[] {
  const { text, rules } = input;
  if (rules.mode === 'single') {
    if (rules.chapter_pattern || rules.volume_pattern || rules.chapter_level || rules.volume_level)
      throw importError(
        'INVALID_STRUCTURE',
        'invalidStructureSingleDoesNotAcceptVolumeChapter',
        {},
      );
    return [];
  }
  if (rules.mode === 'regex') {
    if (!rules.chapter_pattern || rules.chapter_level || rules.volume_level)
      throw importError('INVALID_STRUCTURE', 'invalidStructureRegexRequiresAChapterRuleAnd', {});
    const window = text.slice(selected.start, selected.end);
    return [
      ...headings(window, rules.chapter_pattern, 'chapter'),
      ...(rules.volume_pattern ? headings(window, rules.volume_pattern, 'volume') : []),
    ].map((h) => ({ ...h, start: h.start + selected.start, end: h.end + selected.start }));
  }
  if (
    rules.mode !== 'markdown' ||
    input.format !== 'markdown' ||
    rules.chapter_pattern ||
    rules.volume_pattern ||
    !Number.isInteger(rules.chapter_level) ||
    rules.chapter_level! < 1 ||
    rules.chapter_level! > 6 ||
    (rules.volume_level !== undefined &&
      (!Number.isInteger(rules.volume_level) ||
        rules.volume_level < 1 ||
        rules.volume_level >= rules.chapter_level!))
  )
    throw importError(
      'INVALID_STRUCTURE',
      'invalidStructureMarkdownRequiresAValidChapterLevel',
      {},
    );
  return parseImportMarkdown(text)
    .filter(
      (b) =>
        b.start >= selected.start &&
        b.end <= selected.end &&
        (b.headingLevel === rules.chapter_level ||
          (rules.volume_level !== undefined && b.headingLevel === rules.volume_level)),
    )
    .map((b) => ({
      start: b.start,
      end: b.end,
      title: b.headingTitle!.trim(),
      kind: b.headingLevel === rules.volume_level ? 'volume' : 'chapter',
    }));
}

function addWarnings(text: string, result: ImportStructureResult): void {
  const sizes = result.chapters
    .filter((c) => !c.unassigned)
    .map((c) => c.end - c.start)
    .sort((a, b) => a - b);
  const longLimit = Math.max(20000, (sizes[Math.floor((sizes.length - 1) / 2)] ?? 0) * 8);
  const counts = new Map<string, number>();
  for (const chapter of result.chapters) {
    const key = `${chapter.volumeIndex}:${chapter.title}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const chapter of result.chapters) {
    if (chapter.unassigned) continue;
    if (counts.get(`${chapter.volumeIndex}:${chapter.title}`)! > 1)
      chapter.warnings.push(importFailure('DUPLICATE_HEADING', 'noticeDuplicateHeading'));
    const size = text.slice(chapter.bodyStart, chapter.end).trim().length;
    if (size && size < 20)
      chapter.warnings.push(importFailure('SHORT_CHAPTER', 'noticeShortChapter'));
    if (size > longLimit) chapter.warnings.push(importFailure('LONG_CHAPTER', 'noticeLongChapter'));
  }
}
