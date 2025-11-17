/**
 * AI 服务相关提示词
 */

/**
 * 获取配置信息的提示词
 */
export const CONFIG_PROMPT = `请以 JSON 格式返回你的最大输入 token 数（maxInputTokens），这是我可以发送给你的最大 token 数量，用于限制上下文输入。

请只返回 JSON 对象，格式如下：
{
  "maxInputTokens": 数字
}

如果你不知道确切的 maxInputTokens，但知道 contextWindow（总上下文窗口大小），可以返回：
{
  "maxInputTokens": 数字,
  "contextWindow": 数字
}`;
