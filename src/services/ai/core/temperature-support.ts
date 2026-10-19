// Claude 系列模型标识：opus/sonnet/haiku 带版本号，fable/mythos 只有新世代
const CLAUDE_MODEL_PATTERN =
  /claude-(?:(?:opus|sonnet|haiku)-(\d+)(?:[.-](\d{1,2})(?!\d))?|fable|mythos)/i;

/**
 * 模型是否拒绝温度参数。
 * Claude 4.7 及之后的模型（含 Fable / Mythos）发送非默认温度会直接返回 400；
 * 兼容地址、OpenRouter（anthropic/…）与 Bedrock（anthropic.…）的写法都能识别。
 */
export function modelRejectsTemperature(modelId: string): boolean {
  const match = CLAUDE_MODEL_PATTERN.exec(modelId);
  if (!match) return false;
  const [, major, minor] = match;
  if (major === undefined) return true;
  return Number(major) > 4 || (Number(major) === 4 && Number(minor ?? 0) >= 7);
}
