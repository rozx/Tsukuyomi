export const CONFIG_DISCOVERY_PROMPT = `请以 JSON 格式返回你的 token 限制信息：

请只返回 JSON 对象，格式如下：
{
  "maxInputTokens": 数字,
  "maxOutputTokens": 数字
}

其中：
- maxInputTokens: 最大输入 token 数（上下文窗口大小）
- maxOutputTokens: 最大输出 token 数（单次响应最大 token 数）

如果你只知道其中一个，也可以只返回那个字段。`;
