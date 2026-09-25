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

/**
 * 网站映射中代表「经 Firecrawl 抓取」的保留令牌。
 * 存放在 ProxySiteMappingEntry.proxies[] 中（而非独立字段），以便旧版本经同步保存时不会丢失。
 * 任何把映射条目当作 URL 模板的路径都必须跳过它。
 */
export const FIRECRAWL_MAPPING_TOKEN = 'firecrawl';

// 默认代理服务使用 DEFAULT_PROXY_LIST 的第一项
export const DEFAULT_CORS_PROXY_FOR_AI = DEFAULT_PROXY_LIST[0]!.url;

/**
 * 默认网站-代理映射
 * 为特定网站配置默认使用的代理服务
 */
export const DEFAULT_PROXY_SITE_MAPPING: Record<string, ProxySiteMappingEntry> = {};
