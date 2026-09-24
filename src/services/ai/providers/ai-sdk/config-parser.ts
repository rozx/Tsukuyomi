import type { ConfigJson, ConfigParseResult } from 'src/services/ai/types/interfaces';

/**
 * 解析配置 JSON
 */
export function parseConfigJson(content: string | null): ConfigParseResult {
  if (!content) {
    return {};
  }

  let maxInputTokens: number | undefined;
  let maxOutputTokens: number | undefined;

  try {
    // 尝试解析 JSON
    const configJson = JSON.parse(content) as ConfigJson & {
      contextWindow?: number;
      maxTokens?: number;
    };
    if (typeof configJson.maxInputTokens === 'number') {
      maxInputTokens = configJson.maxInputTokens;
    } else if (typeof configJson.contextWindow === 'number') {
      // 兼容旧字段：contextWindow（总上下文窗口）
      maxInputTokens = configJson.contextWindow;
    }
    if (typeof configJson.maxOutputTokens === 'number') {
      maxOutputTokens = configJson.maxOutputTokens;
    } else if (typeof configJson.maxTokens === 'number') {
      // 兼容旧字段：maxTokens（历史上用于输出上限）
      maxOutputTokens = configJson.maxTokens;
    }
  } catch {
    // JSON 解析失败，尝试从文本中提取
    const extracted = extractConfigFromText(content);
    maxInputTokens = extracted.maxInputTokens;
    maxOutputTokens = extracted.maxOutputTokens;
  }

  // 仅在值存在时包含属性，以符合 exactOptionalPropertyTypes
  const result: ConfigParseResult = {};
  if (maxInputTokens !== undefined) {
    result.maxInputTokens = maxInputTokens;
  }
  if (maxOutputTokens !== undefined) {
    result.maxOutputTokens = maxOutputTokens;
  }
  return result;
}

/**
 * 从文本中提取配置信息
 */
function extractConfigFromText(text: string): ConfigParseResult {
  const maxInputTokensMatch = text.match(/maxInputTokens["\s:]+(\d+)/i);
  const contextWindowMatch = text.match(/contextWindow["\s:]+(\d+)/i);
  const maxOutputTokensMatch = text.match(/maxOutputTokens["\s:]+(\d+)/i);
  const maxTokensMatch = text.match(/maxTokens["\s:]+(\d+)/i);

  const maxInputTokensRaw = firstRegexGroup(maxInputTokensMatch, contextWindowMatch);
  const maxOutputTokensRaw = firstRegexGroup(maxOutputTokensMatch, maxTokensMatch);

  const result: ConfigParseResult = {};

  const maxInputTokens = parsePositiveInt(maxInputTokensRaw);
  if (maxInputTokens !== undefined) {
    result.maxInputTokens = maxInputTokens;
  }

  const maxOutputTokens = parsePositiveInt(maxOutputTokensRaw);
  if (maxOutputTokens !== undefined) {
    result.maxOutputTokens = maxOutputTokens;
  }

  return result;
}

/**
 * 返回首个匹配到捕获组的正则结果（按优先级）
 */
function firstRegexGroup(...matches: Array<RegExpMatchArray | null>): string | undefined {
  for (const match of matches) {
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/**
 * 将字符串解析为正整数，非法或非正时返回 undefined
 */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = parseInt(raw, 10);
  if (!isNaN(value) && value > 0) return value;
  return undefined;
}
