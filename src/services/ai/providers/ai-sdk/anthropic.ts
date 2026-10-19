import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import type { AIThinkingLevel } from 'src/services/ai/types/ai-model';
import type { AIServiceConfig } from 'src/services/ai/types/ai-service';
import { ProxyService } from 'src/services/proxy-service';

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
export const ANTHROPIC_VERSION = '2023-06-01';

/** 历史以助手消息结尾会被当作 prefill，Claude 4.6+ 直接返回 400。 */
export const ANTHROPIC_CONTINUE_PROMPT = '请继续。';

/** 4.5 及更早只支持 budget_tokens；其余（含未知新模型）一律走 adaptive。 */
const LEGACY_MODEL = /claude-3|claude-(?:opus|sonnet|haiku)-4(?:-[0-5])?(?:-\d{8})?(?:$|@)/;
/** Claude 5 起省略 thinking 也会思考，且部分型号拒绝 disabled。 */
const THINKS_BY_DEFAULT = /claude-(?:opus|sonnet|haiku|fable|mythos)-(?:[5-9]|\d{2,})/;
/** 4.6 只有 low/medium/high/max，xhigh 自 4.7 起提供。 */
const NO_XHIGH = /claude-(?:opus|sonnet)-4-6/;
/** Sonnet 5.5 关闭思考的唯一方式是 between_tools。 */
const BETWEEN_TOOLS = /claude-sonnet-5-5/;

const LEGACY_BUDGET: Record<Exclude<AIThinkingLevel, 'provider-default' | 'none'>, number> = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 32000,
};

const SUMMARIZED = { type: 'adaptive', display: 'summarized' } as const;
const EPHEMERAL = { type: 'ephemeral' } as const;

/** 只有缓存断点的厂商选项，挂在 system 消息与工具定义上。 */
export const ANTHROPIC_CACHE_BREAKPOINT = { anthropic: { cacheControl: EPHEMERAL } };

/**
 * 思考等级 → thinking + output_config.effort。
 * 4.6+ 永不发送 budget_tokens 或 disabled（新模型直接 400）；摘要思考走现有 reasoningContent。
 */
function thinkingOptions(
  model: string,
  level: AIThinkingLevel | undefined,
): Pick<AnthropicLanguageModelOptions, 'thinking' | 'effort'> {
  if (LEGACY_MODEL.test(model)) {
    return level && level !== 'provider-default' && level !== 'none'
      ? { thinking: { type: 'enabled', budgetTokens: LEGACY_BUDGET[level] } }
      : {};
  }
  const thinksByDefault = THINKS_BY_DEFAULT.test(model);
  if (!level || level === 'provider-default')
    return thinksByDefault ? { thinking: SUMMARIZED } : {};
  if (level === 'none') {
    // 默认不思考的 4.6–4.8 省略字段即关闭；默认思考的型号只能压到最低
    if (!thinksByDefault) return {};
    return BETWEEN_TOOLS.test(model)
      ? { thinking: { type: 'between_tools' } }
      : { thinking: SUMMARIZED, effort: 'low' };
  }
  const effort =
    level === 'minimal' ? 'low' : level === 'xhigh' && NO_XHIGH.test(model) ? 'max' : level;
  return { thinking: SUMMARIZED, effort };
}

/** 对话尾部用自动缓存；稳定前缀的断点由 service 挂在 system 与工具上。 */
export function anthropicOptions(
  config: Pick<AIServiceConfig, 'model' | 'thinkingLevel'>,
): Pick<AnthropicLanguageModelOptions, 'thinking' | 'effort' | 'cacheControl'> {
  return { ...thinkingOptions(config.model, config.thinkingLevel), cacheControl: EPHEMERAL };
}

/** 浏览器（含 Electron 渲染进程）直连时必须声明，否则官方接口拒绝跨域请求。 */
export function anthropicHeaders(
  baseURL: string,
  config: Pick<AIServiceConfig, 'customHeaders' | 'useCorsProxy'>,
): Record<string, string> {
  const direct =
    typeof window !== 'undefined' &&
    ProxyService.getProxiedUrlForAI(baseURL, config.useCorsProxy) === baseURL;
  return {
    ...(direct ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
    ...config.customHeaders,
  };
}
