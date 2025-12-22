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
  if (originalText && originalText.length > 0) {
    const lengthRatio = text.length / originalText.length;
    if (lengthRatio > MAX_OUTPUT_LENGTH_RATIO) {
      const translationBlockLen = getMaxPatternBlockLength(text, effectiveWindow);
      if (translationBlockLen >= effectiveWindow * HIGH_REPETITION_RATIO) {
        console.warn(
          `[${logLabel}] ⚠️ AI降级检测：输出长度是原文的 ${lengthRatio.toFixed(1)} 倍，且高度重复（重复块 ${translationBlockLen}/${effectiveWindow} 字符）`,
        );
        return true;
      }
    }
  }

  // 获取原文中任意模式的最大重复次数（用于模式重复检测的比较）
  // 因为原文和译文的模式长度可能不同，所以检查所有可能的模式长度
  const getOriginalMaxPatternRepeatCount = () => {
    if (!originalText) {
      return 0;
    }
    // 去除尾部空白和换行符，因为 chunkText 格式可能包含 \n\n 等格式化字符
    const trimmedOriginal = originalText.trimEnd();
    const originalWindow = Math.min(effectiveWindow, trimmedOriginal.length);
    const originalRecent = trimmedOriginal.slice(-originalWindow);
    let maxRepeatCount = 0;

    // 检查所有可能的模式长度（2-5字符）
    for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
      if (originalRecent.length < patternLen * 2) {
        continue;
      }

      // 优先检查从窗口末尾开始的连续重复（这是最常见的场景）
      // 从末尾向前检查，找到最长的连续重复
      for (let offset = 0; offset < patternLen; offset++) {
        const endPos = originalRecent.length - offset;
        if (endPos < patternLen * 2) {
          continue;
        }

        // 从末尾开始，尝试找到连续重复的模式
        const pattern = originalRecent.slice(endPos - patternLen, endPos);
        let repeatCount = 1;
        let cursor = endPos - patternLen * 2;

        // 向前查找连续重复
        while (cursor >= 0) {
          if (originalRecent.slice(cursor, cursor + patternLen) === pattern) {
            repeatCount++;
            cursor -= patternLen;
          } else {
            break;
          }
        }

        if (repeatCount > 1) {
          maxRepeatCount = Math.max(maxRepeatCount, repeatCount);
        }
      }

      // 也检查其他位置（作为后备，但优先级较低）
      for (let start = 0; start <= originalRecent.length - patternLen * 2; start++) {
        const pattern = originalRecent.slice(start, start + patternLen);
        let repeatCount = 1;
        let cursor = start + patternLen;

        while (cursor + patternLen <= originalRecent.length) {
          if (originalRecent.slice(cursor, cursor + patternLen) === pattern) {
            repeatCount++;
            cursor += patternLen;
          } else {
            break;
          }
        }

        if (repeatCount > 1) {
          maxRepeatCount = Math.max(maxRepeatCount, repeatCount);
        }
      }
    }

    return maxRepeatCount;
  };

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
        // 比较重复次数，检查原文中任意模式的最大重复次数
        // 因为原文和译文的模式长度可能不同（如"成功した"4字符 vs "成功了"3字符）
        const maxOriginalRepeatCount = getOriginalMaxPatternRepeatCount();
        const requiredCount = patternRepeatCount * ORIGINAL_PATTERN_SIMILARITY_RATIO;

        // 计算长度比例，用于判断是否应该跳过检测
        const trimmedOriginal = originalText.trimEnd();
        const lengthRatio =
          trimmedOriginal.length > 0 ? text.length / trimmedOriginal.length : Infinity;

        // 如果原文也有类似的重复次数（至少是译文重复次数的75%），不认为是降级
        // 注意：这里比较的是实际重复次数，而不是阈值
        // 允许1次的容差，因为窗口截断可能导致计数略有偏差
        // 但如果译文长度显著超过原文（>1.5倍），仍应判定为降级
        if (maxOriginalRepeatCount >= requiredCount - 1 && lengthRatio <= 1.5) {
          continue;
        }

        // 额外检查：如果原文整体也有高重复度，即使窗口内重复次数不够，也不应判定为降级
        // 但是需要同时检查长度比例，防止译文过长的情况被跳过
        if (trimmedOriginal.length > 0) {
          const fullOriginalMaxRepeat = getMaxPatternRepeatCountInFullText(trimmedOriginal);
          // 如果原文整体也有高重复（至少是译文重复次数的60%），检查长度比例
          if (fullOriginalMaxRepeat >= patternRepeatCount * 0.6 && lengthRatio <= 1.5) {
            continue;
          }
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

/**
 * 计算整个文本中任意模式的最大重复次数（不限制窗口）
 * 用于检查原文整体是否也有高重复度
 */
function getMaxPatternRepeatCountInFullText(text: string): number {
  if (!text) {
    return 0;
  }
  let maxRepeatCount = 0;

  // 检查所有可能的模式长度（2-5字符）
  for (let patternLen = MIN_PATTERN_LENGTH; patternLen <= MAX_PATTERN_LENGTH; patternLen++) {
    if (text.length < patternLen * 2) {
      continue;
    }

    // 检查所有可能的起始位置
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
        maxRepeatCount = Math.max(maxRepeatCount, repeatCount);
      }
    }
  }

  return maxRepeatCount;
}
