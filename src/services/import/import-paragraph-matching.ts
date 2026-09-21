import type { Paragraph } from 'src/models/novel';
import type { ImportParagraphChange } from 'src/models/import';
import type {
  ImportParagraphMatchInput,
  ImportParagraphMatchResult,
} from 'src/models/import-matching';
import { hashJson } from 'src/utils/content-hash';
import { createImportWork } from './import-work-limits';
import type { ImportWorkOptions } from './import-work-limits';

interface MatchState {
  input: ImportParagraphMatchInput;
  matches: Map<number, number>;
  used: Set<number>;
  conflicts: ImportParagraphMatchResult['conflicts'];
  replacements: ImportParagraphMatchResult['replacements'];
  work: ReturnType<typeof createImportWork>;
}

function oldKey(chapterId: string, paragraphId: string): string {
  return JSON.stringify([chapterId, paragraphId]);
}

function assign(state: MatchState, before: number, after: number): void {
  state.matches.set(after, before);
  state.used.add(before);
}

function explicitMatches(state: MatchState): void {
  const old = new Map(
    state.input.old.map((item, index) => [oldKey(item.chapterId, item.paragraph.id), index]),
  );
  if (old.size !== state.input.old.length) throw new Error('MATCH_INPUT: 旧段落身份重复');
  for (const [index, item] of state.input.next.entries()) {
    if (!item.existing) continue;
    const before = old.get(oldKey(item.existing.chapterId, item.existing.paragraphId));
    if (
      before === undefined ||
      state.input.old[before]!.paragraph.text !== item.text ||
      state.used.has(before)
    ) {
      state.conflicts.push({
        code: 'INVALID_EXISTING_REFERENCE',
        message: '既有段落引用缺失、重复或原文不一致',
        newKeys: [item.key],
      });
    } else assign(state, before, index);
  }
}

function uniqueTexts(texts: { index: number; text: string }[]): Map<string, number | null> {
  const positions = new Map<string, number | null>();
  for (const item of texts) {
    if (!item.text.trim()) continue;
    positions.set(item.text, positions.has(item.text) ? null : item.index);
  }
  return positions;
}

function exactAnchors(state: MatchState): void {
  const old = uniqueTexts(
    state.input.old.flatMap((item, index) =>
      state.used.has(index) ? [] : [{ index, text: item.paragraph.text }],
    ),
  );
  const next = uniqueTexts(
    state.input.next.flatMap((item, index) =>
      state.matches.has(index) ? [] : [{ index, text: item.text }],
    ),
  );
  for (const [text, index] of next) {
    const before = old.get(text);
    if (index !== null && before !== undefined && before !== null) assign(state, before, index);
  }
}

/** 每个最优顺序对齐的第 k 个匹配若只有一个候选，就能作为确定锚点。 */
function forcedSequencePairs(old: string[], next: string[]): [number, number][] {
  const width = next.length + 1;
  const prefix = new Uint32Array((old.length + 1) * width);
  const suffix = new Uint32Array(prefix.length);
  const equal = (i: number, j: number) => Boolean(old[i]!.trim()) && old[i] === next[j];
  for (let i = 1; i <= old.length; i++)
    for (let j = 1; j <= next.length; j++) {
      prefix[i * width + j] = equal(i - 1, j - 1)
        ? prefix[(i - 1) * width + j - 1]! + 1
        : Math.max(prefix[(i - 1) * width + j]!, prefix[i * width + j - 1]!);
    }
  for (let i = old.length - 1; i >= 0; i--)
    for (let j = next.length - 1; j >= 0; j--) {
      suffix[i * width + j] = equal(i, j)
        ? suffix[(i + 1) * width + j + 1]! + 1
        : Math.max(suffix[(i + 1) * width + j]!, suffix[i * width + j + 1]!);
    }
  const length = prefix[prefix.length - 1]!;
  const ranks = new Map<number, [number, number] | null>();
  for (let i = 0; i < old.length; i++)
    for (let j = 0; j < next.length; j++) {
      const rank = prefix[i * width + j]! + 1;
      if (equal(i, j) && rank + suffix[(i + 1) * width + j + 1]! === length)
        ranks.set(rank, ranks.has(rank) ? null : [i, j]);
    }
  return [...ranks.values()]
    .filter((pair): pair is [number, number] => pair !== null)
    .sort((a, b) => a[1] - b[1]);
}

async function replacement(
  state: MatchState,
  old: number[],
  next: number[],
  code: string,
): Promise<void> {
  const before = old.map((index) => state.input.old[index]!);
  const after = next.map((index) => state.input.next[index]!);
  const signature = await hashJson({
    scope: state.input.scopeId,
    old: before.map((item) => ({ chapterId: item.chapterId, paragraph: item.paragraph })),
    next: after.map((item) => ({ key: item.key, text: item.text })),
  });
  const confirmed = state.input.allowedReplacements?.includes(signature) ?? false;
  state.replacements.push({
    signature,
    oldKeys: before.map((item) => ({ chapterId: item.chapterId, paragraphId: item.paragraph.id })),
    newKeys: after.map((item) => item.key),
    clearedVersions: before.reduce((count, item) => count + item.paragraph.translations.length, 0),
    confirmed,
  });
  if (!confirmed)
    state.conflicts.push({
      code,
      message:
        code === 'AMBIGUOUS_PARAGRAPH'
          ? '重复原文无法确定对应关系，请指定既有引用或确认替换范围'
          : code === 'MATCHING_LIMIT'
            ? '对应范围过大，请细分范围或确认替换'
            : '多对多修订需要确认替换范围及译文损失',
      newKeys: after.map((item) => item.key),
    });
}

async function matchWindow(
  state: MatchState,
  old: number[],
  next: number[],
  ordered = true,
): Promise<void> {
  if (!old.length || !next.length) return;
  await state.work.checkpoint();
  const oldTexts = old.map((index) => state.input.old[index]!.paragraph.text);
  const newTexts = next.map((index) => state.input.next[index]!.text);
  if (
    ordered &&
    old.length === next.length &&
    oldTexts.every((text, index) => text === newTexts[index])
  ) {
    old.forEach((index, offset) => assign(state, index, next[offset]!));
    return;
  }
  if (old.length === 1 && next.length === 1) {
    assign(state, old[0]!, next[0]!);
    return;
  }
  const available = new Set(oldTexts.filter((text) => text.trim()));
  const shared = newTexts.some((text) => available.has(text));
  if (!shared || !ordered) {
    await replacement(state, old, next, shared ? 'AMBIGUOUS_PARAGRAPH' : 'REPLACEMENT_REQUIRED');
    return;
  }
  if ((old.length + 1) * (next.length + 1) > state.work.limits.gapCells) {
    await replacement(state, old, next, 'MATCHING_LIMIT');
    return;
  }
  const forced = forcedSequencePairs(oldTexts, newTexts);
  if (!forced.length) {
    await replacement(state, old, next, 'AMBIGUOUS_PARAGRAPH');
    return;
  }
  let oldStart = 0;
  let newStart = 0;
  for (const [before, after] of forced) {
    await matchWindow(state, old.slice(oldStart, before), next.slice(newStart, after));
    assign(state, old[before]!, next[after]!);
    oldStart = before + 1;
    newStart = after + 1;
  }
  await matchWindow(state, old.slice(oldStart), next.slice(newStart));
}

async function matchGaps(state: MatchState): Promise<void> {
  const anchors = [...state.matches.entries()].sort((a, b) => a[0] - b[0]);
  const ordered = anchors.every((pair, index) => index === 0 || pair[1] > anchors[index - 1]![1]);
  const oldUnmatched = state.input.old.flatMap((_, index) =>
    state.used.has(index) ? [] : [index],
  );
  const newUnmatched = state.input.next.flatMap((_, index) =>
    state.matches.has(index) ? [] : [index],
  );
  if (!ordered) {
    await matchWindow(state, oldUnmatched, newUnmatched, false);
    return;
  }
  let oldCursor = 0;
  let newCursor = 0;
  for (const [after, before] of [...anchors, [state.input.next.length, state.input.old.length]]) {
    const oldStart = oldCursor;
    const newStart = newCursor;
    while (oldCursor < oldUnmatched.length && oldUnmatched[oldCursor]! < before!) oldCursor++;
    while (newCursor < newUnmatched.length && newUnmatched[newCursor]! < after!) newCursor++;
    await matchWindow(
      state,
      oldUnmatched.slice(oldStart, oldCursor),
      newUnmatched.slice(newStart, newCursor),
    );
  }
}

function stableOrder(matches: Map<number, number>): Set<number> {
  const ordered = [...matches.entries()].sort((a, b) => a[0] - b[0]);
  const tails: number[] = [];
  const previous = new Int32Array(ordered.length).fill(-1);
  for (let index = 0; index < ordered.length; index++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ordered[tails[middle]!]![1] < ordered[index]![1]) low = middle + 1;
      else high = middle;
    }
    if (low) previous[index] = tails[low - 1]!;
    tails[low] = index;
  }
  const stable = new Set<number>();
  let index = tails.at(-1) ?? -1;
  while (index >= 0) {
    stable.add(ordered[index]![0]);
    index = previous[index]!;
  }
  return stable;
}

function materialize(state: MatchState): ImportParagraphMatchResult {
  const paragraphs: ImportParagraphMatchResult['paragraphs'] = [];
  const changes: ImportParagraphChange[] = [];
  const stable = stableOrder(state.matches);
  const usedIds = new Map<string, Set<string>>();
  state.input.next.forEach((item, index) => {
    const before = state.matches.get(index);
    const old = before === undefined ? undefined : state.input.old[before];
    const paragraph: Paragraph = old
      ? (JSON.parse(JSON.stringify(old.paragraph)) as Paragraph)
      : { id: item.newId, text: item.text, translations: [], selectedTranslationId: '' };
    const ids = usedIds.get(item.chapterId) ?? new Set<string>();
    if (ids.has(paragraph.id)) paragraph.id = item.newId;
    if (ids.has(paragraph.id)) throw new Error('MATCH_INPUT: 新段落标识冲突');
    ids.add(paragraph.id);
    usedIds.set(item.chapterId, ids);
    let kind: ImportParagraphChange['kind'] = old
      ? old.chapterId !== item.chapterId || !stable.has(index)
        ? 'move'
        : 'retain'
      : 'insert';
    let clearedVersions = 0;
    if (old && old.paragraph.text !== item.text) {
      kind = 'revise';
      clearedVersions = paragraph.translations.length;
      paragraph.text = item.text;
      paragraph.translations = [];
      paragraph.selectedTranslationId = '';
    }
    paragraphs.push({ key: item.key, chapterId: item.chapterId, paragraph });
    changes.push({
      chapterId: item.chapterId,
      paragraphId: paragraph.id,
      kind,
      ...(old
        ? {
            before: old.paragraph.text,
            fromChapterId: old.chapterId,
            fromParagraphId: old.paragraph.id,
          }
        : {}),
      after: item.text,
      clearedVersions,
    });
  });
  state.input.old.forEach((old, index) => {
    if (!state.used.has(index))
      changes.push({
        chapterId: old.chapterId,
        paragraphId: old.paragraph.id,
        kind: 'remove',
        before: old.paragraph.text,
        clearedVersions: old.paragraph.translations.length,
      });
  });
  return { paragraphs, changes, conflicts: state.conflicts, replacements: state.replacements };
}

export async function matchImportParagraphs(
  input: ImportParagraphMatchInput,
  options: ImportWorkOptions = {},
): Promise<ImportParagraphMatchResult> {
  const work = createImportWork(options);
  if (
    input.old.length + input.next.length > work.limits.paragraphs ||
    input.old.reduce((sum, item) => sum + item.paragraph.text.length, 0) +
      input.next.reduce((sum, item) => sum + item.text.length, 0) >
      work.limits.textCharacters * 2
  )
    throw new Error('MATCHING_LIMIT: 匹配范围超过当前环境上限');
  if (new Set(input.next.map((item) => item.key)).size !== input.next.length)
    throw new Error('MATCH_INPUT: 新段落来源身份重复');
  await work.checkpoint(true);
  const state: MatchState = {
    input,
    matches: new Map(),
    used: new Set(),
    conflicts: [],
    replacements: [],
    work,
  };
  explicitMatches(state);
  exactAnchors(state);
  await matchGaps(state);
  await work.checkpoint(true);
  return materialize(state);
}
