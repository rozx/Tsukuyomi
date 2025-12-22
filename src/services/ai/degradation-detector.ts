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

  if (!text || text.length < config.repeatCheckWindow) {
    return false;
  }

  // 检查最近N个字符
  const recentText = text.slice(-config.repeatCheckWindow);
  const getOriginalPatternBlockLength = (() => {
    let computed = false;
    let cached = 0;
    return () => {
      if (computed) {
        return cached;
      }
      computed = true;
      if (!originalText) {
        return 0;
      }
      cached = getMaxPatternBlockLength(originalText, config.repeatCheckWindow);
      return cached;
    };
  })();

  // 1. 单个字符重复检测
  // 检查是否有单个字符重复超过阈值
  for (let i = 0; i < recentText.length; i++) {
    const char = recentText[i];
    if (!char) continue;

    // 计算从当前位置开始的连续重复次数
    let repeatCount = 1;
    for (let j = i + 1; j < recentText.length; j++) {
      if (recentText[j] === char) {
        repeatCount++;
      } else {
        break;
      }
    }

    // 如果连续重复超过阈值，检查原文是否也有类似重复
    if (repeatCount >= config.repeatThreshold) {
      // 如果提供了原文，检查原文中是否也有类似的重复
      if (originalText) {
        // 扫描整个原文，寻找该字符的最大连续重复次数
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
        maxOriginalRepeat = Math.max(maxOriginalRepeat, currentOriginalRepeat);

        // 如果原文也有类似的重复（至少是阈值的一半），不认为是降级
        if (maxOriginalRepeat >= config.repeatThreshold * 0.5) {
          continue;
        }
      }
      console.warn(
        `[${logLabel}] ⚠️ AI降级检测：字符 "${char}" 在最近 ${config.repeatCheckWindow} 个字符中连续重复 ${repeatCount} 次（阈值: ${config.repeatThreshold}）`,
      );
      return true;
    }
  }

  // 2. 模式重复检测
  // 检查是否有短模式重复（如 "ababab..." 或 "abcabc..."）
  // 检查2-5字符的模式
  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (recentText.length < patternLen * 10) continue;

    const pattern = recentText.slice(-patternLen);
    let patternRepeatCount = 1;

    // 检查模式是否重复
    for (let i = recentText.length - patternLen * 2; i >= 0; i -= patternLen) {
      const candidate = recentText.slice(i, i + patternLen);
      if (candidate === pattern) {
        patternRepeatCount++;
      } else {
        break;
      }
    }

    // 如果模式重复超过阈值，检查原文是否也有类似重复
    if (patternRepeatCount >= config.patternRepeatThreshold) {
      if (originalText) {
        const maxOriginalPatternBlockLength = getOriginalPatternBlockLength();
        const currentPatternBlockLength = patternRepeatCount * patternLen;
        if (
          maxOriginalPatternBlockLength > 0 &&
          maxOriginalPatternBlockLength >= currentPatternBlockLength * ORIGINAL_PATTERN_SIMILARITY_RATIO
        ) {
          continue;
        }
      }
      console.warn(
        `[${logLabel}] ⚠️ AI降级检测：模式 "${pattern}" (长度 ${patternLen}) 在最近 ${config.repeatCheckWindow} 个字符中重复 ${patternRepeatCount} 次（阈值: ${config.patternRepeatThreshold}）`,
      );
      return true;
    }
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

