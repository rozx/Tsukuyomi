import type { ProxySiteMappingEntry } from 'src/models/settings';

/**
 * 默认代理列表
 */
export const DEFAULT_PROXY_LIST: Array<{
  id: string;
  name: string;
  url: string;
  description?: string;
}> = [
  {
    id: 'rozx.moe',
    name: 'CORS Tsukuyomi (推荐使用)',
    url: 'https://cors.rozx.moe/?{url}',
    description: 'Tsukuyomi（月詠） - Moonlit Translator 默认代理 (#^.^#)。',
  },
];

// 默认代理服务使用 DEFAULT_PROXY_LIST 的第一项
export const DEFAULT_CORS_PROXY_FOR_AI = DEFAULT_PROXY_LIST[0]!.url;

/**
 * 默认网站-代理映射
 * 为特定网站配置默认使用的代理服务
 */
export const DEFAULT_PROXY_SITE_MAPPING: Record<string, ProxySiteMappingEntry> = {};
