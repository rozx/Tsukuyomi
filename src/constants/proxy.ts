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
    name: 'CORS Luna',
    url: 'https://cors.rozx.moe/?{url}',
    description: 'Luna AI translator 默认代理 (#^.^#)。',
  },
  {
    id: 'corslol',
    name: 'CORS.lol (推荐)',
    url: 'https://api.cors.lol/?url={url}',
    description: '开源 CORS 代理，免费计划支持无限请求',
  },
  {
    id: 'allorigins',
    name: 'AllOrigins',
    url: 'https://api.allorigins.win/raw?url={url}',
    description: '稳定可靠，直接返回内容',
  },
  {
    id: 'corsproxy',
    name: 'CORS Proxy',
    url: 'https://corsproxy.io/?{url}',
    description: '免费 CORS 代理服务',
  },
  {
    id: 'x2u',
    name: 'X2U CORS',
    url: 'https://go.x2u.in/proxy?email=nakelycu@denipl.net&apiKey=cccc14a8&url={url}',
    description: '免费 CORS 代理服务',
  },
  {
    id: 'codetabs',
    name: 'CodeTabs CORS',
    url: 'https://api.codetabs.com/v1/proxy?quest={url}',
    description: '免费 CORS 代理服务，用于绕过同源策略，支持标准 AJAX 请求到第三方服务',
  },
];

// 默认代理服务使用 DEFAULT_PROXY_LIST 的第一项
export const DEFAULT_CORS_PROXY_FOR_AI = DEFAULT_PROXY_LIST[0]!.url;
