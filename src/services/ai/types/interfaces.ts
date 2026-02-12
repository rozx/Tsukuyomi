/**
 * API 响应解析结果接口
 */
export interface ParsedResponse {
  content: string | null;
  modelId?: string;
}

/**
 * 配置 JSON 解析结果接口
 */
export interface ConfigJson {
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

/**
 * 配置解析结果接口
 */
export interface ConfigParseResult {
  maxInputTokens?: number;
  maxOutputTokens?: number;
}
