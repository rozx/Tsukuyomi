/**
 * AI 降级检测工具
 * 用于检测 AI 生成的文本中是否有过多的重复字符或模式，这通常表示 AI 服务降级
 */

/**
 * 检测配置选项
 */
export interface DegradationDetectionOptions {
  /**
   * 连续重复字符的阈值（默认 80）
   */
  repeatThreshold?: number;
  /**
   * 检查窗口大小，即检查最近N个字符（默认 100）
   */
  repeatCheckWindow?: number;
  /**
   * 模式重复阈值（默认 30）
   */
  patternRepeatThreshold?: number;
  /**
   * 日志标签，用于标识调用来源（可选）
   */
  logLabel?: string;
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<Omit<DegradationDetectionOptions, 'logLabel'>> = {
  repeatThreshold: 80,
  repeatCheckWindow: 100,
  patternRepeatThreshold: 30,
};

/**
 * 模式检测相关常量
 */
const MIN_PATTERN_LENGTH = 2;
const MAX_PATTERN_LENGTH = 5;
/**
 * 原文重复度与译文相近时允许跳过降级判定的比例
 */
const ORIGINAL_PATTERN_SIMILARITY_RATIO = 0.75;

/**
 * 输出长度与原文长度的最大比例（超过此比例且高度重复时判定为降级）
 */
const MAX_OUTPUT_LENGTH_RATIO = 2;

/**
 * 高度重复的判定阈值（重复块占窗口的比例）
 */
const HIGH_REPETITION_RATIO = 0.8;

/**
 * 检测文本中是否有过多的重复字符（AI降级检测）
 * @param text 要检测的文本（AI生成的结果）
 * @param originalText 原文（用于比较，如果原文也有重复则不认为是降级）
 * @param options 检测配置选项（可选）
 * @returns 如果检测到重复，返回true
 */
export function detectRepeatingCharacters(
  text: string,
  originalText?: string,
  options?: DegradationDetectionOptions,
): boolean {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const logLabel = options?.logLabel || 'AI降级检测';

  if (!text) {
    return false;
  }

  // 检查最近N个字符
  const effectiveWindow = Math.min(config.repeatCheckWindow, text.length);
  const recentText = text.slice(-effectiveWindow);

  // 0. 长度比例检测：即使原文也有重复，输出长度远超原文时仍判定为降级
  if (detectLengthRatioDegradation(text, originalText, effectiveWindow, logLabel)) {
    return true;
  }

  // 1. 单个字符重复检测
  if (detectSingleCharRepeat(recentText, originalText, config, logLabel)) {
    return true;
  }

  // 2. 模式重复检测
  if (detectPatternRepeat(recentText, text, originalText, effectiveWindow, config, logLabel)) {
    return true;
  }

  return false;
}

/**
 * 长度比例检测：输出长度远超原文且高度重复时判定为降级
 */
function detectLengthRatioDegradation(
  text: string,
  originalText: string | undefined,
  effectiveWindow: number,
  logLabel: string,
): boolean {
  if (!originalText || originalText.length === 0) {
    return false;
  }
  const lengthRatio = text.length / originalText.length;
  if (lengthRatio <= MAX_OUTPUT_LENGTH_RATIO) {
    return false;
  }
  const translationBlockLen = getMaxPatternBlockLength(text, effectiveWindow);
  if (translationBlockLen < effectiveWindow * HIGH_REPETITION_RATIO) {
    return false;
  }
  console.warn(
    `[${logLabel}] ⚠️ AI降级检测：输出长度是原文的 ${lengthRatio.toFixed(1)} 倍，且高度重复（重复块 ${translationBlockLen}/${effectiveWindow} 字符）`,
  );
  return true;
}

/**
 * 计算从给定位置开始的连续重复字符数
 */
function countConsecutiveChar(text: string, startIndex: number, char: string): number {
  let repeatCount = 1;
  for (let j = startIndex + 1; j < text.length; j++) {
    if (text[j] === char) {
      repeatCount++;
    } else {
      break;
    }
  }
  return repeatCount;
}

/**
 * 扫描原文，寻找指定字符的最大连续重复次数
 */
function maxConsecutiveCharInOriginal(originalText: string, char: string): number {
  let maxOriginalRepeat = 0;
  let currentOriginalRepeat = 0;
  for (let k = 0; k < originalText.length; k++) {
    if (originalText[k] === char) {
      currentOriginalRepeat++;
    } else {
      maxOriginalRepeat = Math.max(maxOriginalRepeat, currentOriginalRepeat);
      currentOriginalRepeat = 0;
    }
  }
  return Math.max(maxOriginalRepeat, currentOriginalRepeat);
}

/**
 * 单个字符重复检测
 */
function detectSingleCharRepeat(
  recentText: string,
  originalText: string | undefined,
  config: Required<Omit<DegradationDetectionOptions, 'logLabel'>>,
  logLabel: string,
): boolean {
  for (let i = 0; i < recentText.length; i++) {
    const char = recentText[i];
    if (!char) continue;

    const repeatCount = countConsecutiveChar(recentText, i, char);
    if (repeatCount < config.repeatThreshold) {
      continue;
    }

    // 如果原文也有类似的重复（至少是阈值的一半），不认为是降级
    if (originalText) {
      const maxOriginalRepeat = maxConsecutiveCharInOriginal(originalText, char);
      if (maxOriginalRepeat >= config.repeatThreshold * 0.5) {
        continue;
      }
    }

    console.warn(
      `[${logLabel}] ⚠️ AI降级检测：字符 "${char}" 在最近 ${config.repeatCheckWindow} 个字符中连续重复 ${repeatCount} 次（阈值: ${config.repeatThreshold}）`,
    );
    return true;
  }
  return false;
}

/**
 * 获取原文窗口内任意模式的最大重复次数
 * 因为原文和译文的模式长度可能不同，所以检查所有可能的模式长度
 */
function getOriginalMaxPatternRepeatCount(
  originalText: string | undefined,
  effectiveWindow: number,
): number {
  if (!originalText) {
    return 0;
  }
  // 去除尾部空白和换行符，因为 chunkText 格式可能包含 \n\n 等格式化字符
  const trimmedOriginal = originalText.trimEnd();
  const originalWindow = Math.min(effectiveWindow, trimmedOriginal.length);
  const originalRecent = trimmedOriginal.slice(-originalWindow);
  let maxRepeatCount = 0;

  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (originalRecent.length < patternLen * 2) {
      continue;
    }
    maxRepeatCount = Math.max(
      maxRepeatCount,
      maxTailAlignedRepeatAtLen(originalRecent, patternLen),
      maxAnyStartRepeatAtLen(originalRecent, patternLen),
    );
  }

  return maxRepeatCount;
}

/**
 * 从窗口末尾开始寻找给定长度的最大连续重复次数（优先检查此场景）
 */
function maxTailAlignedRepeatAtLen(text: string, patternLen: number): number {
  let maxRepeat = 0;
  for (let offset = 0; offset < patternLen; offset++) {
    const endPos = text.length - offset;
    if (endPos < patternLen * 2) {
      continue;
    }

    const pattern = text.slice(endPos - patternLen, endPos);
    let repeatCount = 1;
    let cursor = endPos - patternLen * 2;

    while (cursor >= 0) {
      if (text.slice(cursor, cursor + patternLen) === pattern) {
        repeatCount++;
        cursor -= patternLen;
      } else {
        break;
      }
    }

    if (repeatCount > 1) {
      maxRepeat = Math.max(maxRepeat, repeatCount);
    }
  }
  return maxRepeat;
}

/**
 * 检查任意起始位置的给定长度模式最大连续重复次数
 */
function maxAnyStartRepeatAtLen(text: string, patternLen: number): number {
  let maxRepeat = 0;
  for (let start = 0; start <= text.length - patternLen * 2; start++) {
    const pattern = text.slice(start, start + patternLen);
    let repeatCount = 1;
    let cursor = start + patternLen;

    while (cursor + patternLen <= text.length) {
      if (text.slice(cursor, cursor + patternLen) === pattern) {
        repeatCount++;
        cursor += patternLen;
      } else {
        break;
      }
    }

    if (repeatCount > 1) {
      maxRepeat = Math.max(maxRepeat, repeatCount);
    }
  }
  return maxRepeat;
}

/**
 * 判断某个模式长度下，译文尾部的模式是否属于可接受的重复（不算降级）
 */
function isPatternRepeatExplainedByOriginal(
  patternRepeatCount: number,
  text: string,
  originalText: string,
  effectiveWindow: number,
): boolean {
  // 比较重复次数，检查原文中任意模式的最大重复次数
  // 因为原文和译文的模式长度可能不同（如"成功した"4字符 vs "成功了"3字符）
  const maxOriginalRepeatCount = getOriginalMaxPatternRepeatCount(originalText, effectiveWindow);
  const requiredCount = patternRepeatCount * ORIGINAL_PATTERN_SIMILARITY_RATIO;

  const trimmedOriginal = originalText.trimEnd();
  const lengthRatio =
    trimmedOriginal.length > 0 ? text.length / trimmedOriginal.length : Infinity;

  // 如果原文也有类似的重复次数（至少是译文重复次数的75%），不认为是降级
  // 允许1次的容差，因为窗口截断可能导致计数略有偏差
  // 但如果译文长度显著超过原文（>1.5倍），仍应判定为降级
  if (maxOriginalRepeatCount >= requiredCount - 1 && lengthRatio <= 1.5) {
    return true;
  }

  // 额外检查：如果原文整体也有高重复度，即使窗口内重复次数不够，也不应判定为降级
  if (trimmedOriginal.length > 0) {
    const fullOriginalMaxRepeat = getMaxPatternRepeatCountInFullText(trimmedOriginal);
    if (fullOriginalMaxRepeat >= patternRepeatCount * 0.6 && lengthRatio <= 1.5) {
      return true;
    }
  }

  return false;
}

/**
 * 模式重复检测：检查 2-5 字符短模式在窗口尾部的重复
 */
function detectPatternRepeat(
  recentText: string,
  text: string,
  originalText: string | undefined,
  effectiveWindow: number,
  config: Required<Omit<DegradationDetectionOptions, 'logLabel'>>,
  logLabel: string,
): boolean {
  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (recentText.length < patternLen * 10) continue;

    const pattern = recentText.slice(-patternLen);
    let patternRepeatCount = 1;

    for (let i = recentText.length - patternLen * 2; i >= 0; i -= patternLen) {
      const candidate = recentText.slice(i, i + patternLen);
      if (candidate === pattern) {
        patternRepeatCount++;
      } else {
        break;
      }
    }

    if (patternRepeatCount < config.patternRepeatThreshold) {
      continue;
    }

    if (
      originalText &&
      isPatternRepeatExplainedByOriginal(patternRepeatCount, text, originalText, effectiveWindow)
    ) {
      continue;
    }

    console.warn(
      `[${logLabel}] ⚠️ AI降级检测：模式 "${pattern}" (长度 ${patternLen}) 在最近 ${config.repeatCheckWindow} 个字符中重复 ${patternRepeatCount} 次（阈值: ${config.patternRepeatThreshold}）`,
    );
    return true;
  }

  return false;
}

/**
 * 计算文本中最大的连续重复模式长度（限定在窗口与模式长度范围内）
 */
function getMaxPatternBlockLength(text: string, windowSize: number): number {
  if (!text) {
    return 0;
  }
  const recentSegment = text.slice(-Math.min(windowSize, text.length));
  let maxBlockLength = 0;

  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (recentSegment.length < patternLen * 2) {
      continue;
    }
    for (let start = 0; start <= recentSegment.length - patternLen * 2; start++) {
      const pattern = recentSegment.slice(start, start + patternLen);
      let repeatCount = 1;
      let cursor = start + patternLen;

      while (cursor + patternLen <= recentSegment.length) {
        if (recentSegment.slice(cursor, cursor + patternLen) === pattern) {
          repeatCount++;
          cursor += patternLen;
        } else {
          break;
        }
      }

      if (repeatCount > 1) {
        const blockLength = repeatCount * patternLen;
        if (blockLength > maxBlockLength) {
          maxBlockLength = blockLength;
        }
      }
    }
  }

  return maxBlockLength;
}

/**
 * 计算整个文本中任意模式的最大重复次数（不限制窗口）
 * 用于检查原文整体是否也有高重复度
 */
function getMaxPatternRepeatCountInFullText(text: string): number {
  if (!text) {
    return 0;
  }
  let maxRepeatCount = 0;

  // 检查所有可能的模式长度（2-5字符）— 委托给 maxAnyStartRepeatAtLen 避免重复滑窗代码
  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (text.length < patternLen * 2) {
      continue;
    }
    maxRepeatCount = Math.max(maxRepeatCount, maxAnyStartRepeatAtLen(text, patternLen));
  }

  return maxRepeatCount;
}
