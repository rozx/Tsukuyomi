import type { ExternalAgentChannel } from 'src/models/agent-mcp';

const DEFAULT_EXTERNAL_TAG = 'external';

const EXTERNAL_CHANNEL_META: Record<
  ExternalAgentChannel,
  { prefix: string; label: 'MCP' | 'WebMCP' }
> = {
  'desktop-mcp': { prefix: 'mcp:', label: 'MCP' },
  webmcp: { prefix: 'webmcp:', label: 'WebMCP' },
};

const EXTERNAL_CHANNEL_LIST = Object.values(EXTERNAL_CHANNEL_META);

/**
 * 将外部通道枚举映射为面向用户的短标签（MCP / WebMCP）。
 */
export function getExternalChannelDisplayName(channel: ExternalAgentChannel): 'MCP' | 'WebMCP' {
  return EXTERNAL_CHANNEL_META[channel].label;
}

/**
 * 清理外部 Agent 传入的 model_label，去除控制字符与过长内容，构造规范的 aiModelId。
 */
export function buildExternalTranslationModelId(
  channel: ExternalAgentChannel,
  modelLabel?: string | null,
): string {
  const cleaned = (modelLabel ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${EXTERNAL_CHANNEL_META[channel].prefix}${cleaned || DEFAULT_EXTERNAL_TAG}`;
}

function formatExternalLabel(channelLabel: string, rawTag: string): string {
  const tag = rawTag.trim();
  if (!tag || tag.toLowerCase() === DEFAULT_EXTERNAL_TAG) {
    return channelLabel;
  }
  return `${channelLabel} · ${tag}`;
}

/**
 * 解析译文记录上的 aiModelId 为面向用户的可读标签：
 * 1. 先匹配站内已配置模型
 * 2. 未命中时识别 mcp:* / webmcp:* 外部来源前缀
 * 3. 仍未命中则回退到调用方传入的 fallback
 */
export function resolveTranslationModelLabel<Fallback extends string | null>(
  aiModelId: string | undefined | null,
  models: ReadonlyArray<{ id: string; name: string }>,
  fallback: Fallback,
): string | Fallback {
  if (!aiModelId) return fallback;

  const matched = models.find((m) => m.id === aiModelId);
  if (matched) return matched.name;

  for (const meta of EXTERNAL_CHANNEL_LIST) {
    if (aiModelId.startsWith(meta.prefix)) {
      return formatExternalLabel(meta.label, aiModelId.slice(meta.prefix.length));
    }
  }

  return fallback;
}
