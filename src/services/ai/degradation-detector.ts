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
  for (let patternLen = 2; patternLen <= 5; patternLen++) {
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
      // 如果提供了原文，检查原文中是否也有类似的重复模式
      if (originalText) {
        let maxOriginalPatternRepeat = 0;

        // 扫描整个原文，寻找该模式的最大连续重复次数
        for (let k = 0; k <= originalText.length - patternLen; k++) {
          if (originalText.slice(k, k + patternLen) === pattern) {
            let currentRun = 1;
            let nextIdx = k + patternLen;
            while (
              nextIdx <= originalText.length - patternLen &&
              originalText.slice(nextIdx, nextIdx + patternLen) === pattern
            ) {
              currentRun++;
              nextIdx += patternLen;
            }
            maxOriginalPatternRepeat = Math.max(maxOriginalPatternRepeat, currentRun);
            // 跳过已检测的部分
            k = nextIdx - 1;
          }
        }

        // 如果原文也有类似的重复（至少是阈值的一半），不认为是降级
        if (maxOriginalPatternRepeat >= config.patternRepeatThreshold * 0.5) {
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

