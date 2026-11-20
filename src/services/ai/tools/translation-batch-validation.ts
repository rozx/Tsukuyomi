import { isSymbolOnly } from 'src/utils/text-utils';

const MIN_ORIGINAL_TEXT_PREFIX_LENGTH = 3;
/** 以短词开头的段落（如「はい、…」），与原文开头一致时允许的最短前缀 */
const MIN_LEADING_WORD_PREFIX_LENGTH = 2;
const MAX_ORIGINAL_TEXT_PREFIX_LENGTH = 20;
export const MAX_PARAGRAPH_ID_EDIT_DISTANCE = 2;

/** 有效字符：字母 / 数字（含假名、汉字），与 isSymbolOnly 的判定口径一致 */
const CONTENT_CHAR_PATTERN = /[\p{L}\p{N}]/gu;
const LEADING_NON_CONTENT_PATTERN = /^[^\p{L}\p{N}]+/u;
/** emoji 变体选择符（❤ / ❤️ 是同一字符） */
const VARIATION_SELECTOR_PATTERN = /[︎️]/gu;
const WHITESPACE_PATTERN = /\s+/gu;
/** 以空格分词的文字：两字短前缀必须是完整单词（He 不能锚定 Hello） */
const SPACE_DELIMITED_CHAR_PATTERN = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u;
const CONTENT_CHAR_TEST_PATTERN = /[\p{L}\p{N}]/u;

export type PrefixLengthResult =
  | { valid: true }
  | {
      valid: false;
      errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT' | 'ORIGINAL_TEXT_PREFIX_TOO_LONG';
      limit: number;
    };

export type ParagraphIdMatchResult =
  | { type: 'no_match' }
  | { type: 'matched'; matchedId: string; distance: number }
  | { type: 'ambiguous'; distance: number; candidateIds: string[] };

export type PrefixValidationCode =
  | 'MISSING_ORIGINAL_TEXT_PREFIX'
  | 'ORIGINAL_TEXT_PREFIX_TOO_SHORT'
  | 'ORIGINAL_TEXT_PREFIX_TOO_LONG'
  | 'ORIGINAL_TEXT_PREFIX_MISMATCH';

export interface PrefixCheckOutcome {
  failure?: { errorCode: PrefixValidationCode; limit?: number };
  warning?: { errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_LONG'; limit: number };
}

function countContentChars(text: string): number {
  return text.match(CONTENT_CHAR_PATTERN)?.length ?? 0;
}

/**
 * 锚点比对前的规范化：NFKC（全角 ！？ → !?、… → ...、⁉ → !?、全角空格 → 空格）、
 * 去掉 emoji 变体选择符、统一小写。
 */
function canonicalizeAnchorText(text: string): string {
  return text.normalize('NFKC').replace(VARIATION_SELECTOR_PATTERN, '').toLowerCase();
}

/**
 * 判断前缀是否出自原文（includes 语义），比对前做规范化并忽略空白差异。
 */
export function prefixMatchesOriginal(prefix: string, originalText: string): boolean {
  const normalizedPrefix = canonicalizeAnchorText(prefix).replace(WHITESPACE_PATTERN, '');
  if (!normalizedPrefix) {
    return false;
  }
  return canonicalizeAnchorText(originalText)
    .replace(WHITESPACE_PATTERN, '')
    .includes(normalizedPrefix);
}

function isLeadingWordPrefix(prefix: string, originalText: string): boolean {
  const corePrefix = canonicalizeAnchorText(prefix).replace(LEADING_NON_CONTENT_PATTERN, '');
  const coreOriginal = canonicalizeAnchorText(originalText).replace(
    LEADING_NON_CONTENT_PATTERN,
    '',
  );
  if (corePrefix.length < MIN_LEADING_WORD_PREFIX_LENGTH || !coreOriginal.startsWith(corePrefix)) {
    return false;
  }

  const lastPrefixChar = corePrefix.slice(-1);
  const nextOriginalChar = coreOriginal.charAt(corePrefix.length);
  const cutsWord =
    SPACE_DELIMITED_CHAR_PATTERN.test(lastPrefixChar) &&
    CONTENT_CHAR_TEST_PATTERN.test(nextOriginalChar);
  return !cutsWord;
}

function isAcceptableShortPrefix(prefix: string, originalText: string): boolean {
  const prefixContentCount = countContentChars(prefix);
  if (prefixContentCount === 0) {
    return false;
  }

  const originalContentCount = countContentChars(originalText);
  if (
    originalContentCount < MIN_ORIGINAL_TEXT_PREFIX_LENGTH &&
    prefixContentCount >= originalContentCount
  ) {
    return true;
  }

  return isLeadingWordPrefix(prefix, originalText);
}

/**
 * 校验前缀长度是否在合法范围内（不含 includes 匹配和纯符号跳过逻辑）。
 */
export function validatePrefixLength(prefix: string, originalText: string): PrefixLengthResult {
  const effectiveMinLength = Math.min(MIN_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length);

  if (prefix.length < effectiveMinLength && !isAcceptableShortPrefix(prefix, originalText)) {
    return { valid: false, errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT', limit: effectiveMinLength };
  }

  const maxPrefixLength = Math.min(MAX_ORIGINAL_TEXT_PREFIX_LENGTH, originalText.length);

  if (prefix.length > maxPrefixLength) {
    return { valid: false, errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_LONG', limit: maxPrefixLength };
  }

  return { valid: true };
}

/**
 * 纯函数校验原文前缀（长度 + includes 匹配），供站内 add_translation_batch 与外部 Agent submit_translations 共享。
 */
export function checkOriginalTextPrefix(
  trimmedPrefix: string,
  trimmedOriginalText: string,
): PrefixCheckOutcome {
  if (!trimmedPrefix) {
    return { failure: { errorCode: 'MISSING_ORIGINAL_TEXT_PREFIX' } };
  }

  let warning: PrefixCheckOutcome['warning'];
  if (!isSymbolOnly(trimmedOriginalText)) {
    const prefixCheck = validatePrefixLength(trimmedPrefix, trimmedOriginalText);
    if (!prefixCheck.valid) {
      if (prefixCheck.errorCode === 'ORIGINAL_TEXT_PREFIX_TOO_SHORT') {
        return {
          failure: {
            errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_SHORT',
            limit: prefixCheck.limit,
          },
        };
      }
      warning = { errorCode: 'ORIGINAL_TEXT_PREFIX_TOO_LONG', limit: prefixCheck.limit };
    }
  }

  if (!prefixMatchesOriginal(trimmedPrefix, trimmedOriginalText)) {
    return {
      failure: { errorCode: 'ORIGINAL_TEXT_PREFIX_MISMATCH' },
      ...(warning ? { warning } : {}),
    };
  }

  return warning ? { warning } : {};
}

/**
 * 计算两个字符串的 Levenshtein 编辑距离（带阈值剪枝）
 */
function calculateLevenshteinDistance(source: string, target: string, maxDistance: number): number {
  if (source === target) {
    return 0;
  }

  const sourceLength = source.length;
  const targetLength = target.length;

  if (Math.abs(sourceLength - targetLength) > maxDistance) {
    return maxDistance + 1;
  }

  const previousRow = new Array<number>(targetLength + 1);
  for (let j = 0; j <= targetLength; j++) {
    previousRow[j] = j;
  }

  for (let i = 1; i <= sourceLength; i++) {
    const currentRow = new Array<number>(targetLength + 1);
    currentRow[0] = i;
    let rowMin = currentRow[0];

    for (let j = 1; j <= targetLength; j++) {
      const substitutionCost = source[i - 1] === target[j - 1] ? 0 : 1;
      const deletion = previousRow[j]! + 1;
      const insertion = currentRow[j - 1]! + 1;
      const substitution = previousRow[j - 1]! + substitutionCost;

      const value = Math.min(deletion, insertion, substitution);
      currentRow[j] = value;

      if (value < rowMin) {
        rowMin = value;
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= targetLength; j++) {
      previousRow[j] = currentRow[j]!;
    }
  }

  return previousRow[targetLength] ?? maxDistance + 1;
}

/**
 * 在允许范围中为 paragraph_id 查找最接近的候选。
 */
export function findBestParagraphIdMatch(
  paragraphId: string,
  allowedParagraphIds: Set<string>,
  maxDistance: number = MAX_PARAGRAPH_ID_EDIT_DISTANCE,
): ParagraphIdMatchResult {
  let bestDistance = maxDistance + 1;
  let bestCandidates: string[] = [];

  for (const candidateId of allowedParagraphIds) {
    const distance = calculateLevenshteinDistance(paragraphId, candidateId, maxDistance);
    if (distance > maxDistance) {
      continue;
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidates = [candidateId];
      continue;
    }

    if (distance === bestDistance) {
      bestCandidates.push(candidateId);
    }
  }

  if (bestCandidates.length === 0) {
    return { type: 'no_match' };
  }

  if (bestCandidates.length === 1) {
    return {
      type: 'matched',
      matchedId: bestCandidates[0]!,
      distance: bestDistance,
    };
  }

  return {
    type: 'ambiguous',
    distance: bestDistance,
    candidateIds: bestCandidates,
  };
}
