/**
 * 域名工具函数
 */

/**
 * 从 URL 或域名中提取根域名
 * @param input URL 或域名字符串
 * @returns 根域名，如果输入无效则返回 null
 * 
 * @example
 * extractRootDomain('https://www.example.com/path') // 'example.com'
 * extractRootDomain('subdomain.example.co.jp') // 'example.co.jp'
 * extractRootDomain('www.example.com') // 'example.com'
 */
export function extractRootDomain(input: string): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 正则表达式：匹配URL中的域名部分
  // 匹配 http://, https://, // 开头的URL，或直接是域名
  const urlPattern = /^(?:https?:\/\/)?(?:\/\/)?([^/\s?#]+)/i;
  const urlMatch = trimmed.match(urlPattern);

  if (!urlMatch || !urlMatch[1]) {
    return trimmed || null;
  }

  let domain = urlMatch[1];

  // 移除端口号（如果有）
  domain = domain.replace(/:\d+$/, '');

  // 移除 www. 前缀（使用正则）
  domain = domain.replace(/^www\./i, '');

  // 使用正则表达式直接提取根域名
  // 首先尝试匹配特殊二级域名后缀（如 .co.jp, .com.au, .co.uk 等）
  // 匹配格式：任意子域名.主域名.二级域名.顶级域名
  const specialSuffixPattern =
    /(?:[^.]+\.)*([^.]+\.(?:co\.jp|com\.au|co\.uk|com\.br|co\.za|net\.au|org\.uk|gov\.uk|ac\.uk|edu\.au|gov\.au))$/i;
  const specialMatch = domain.match(specialSuffixPattern);

  if (specialMatch && specialMatch[1]) {
    return specialMatch[1];
  }

  // 普通情况：匹配主域名.顶级域名
  // 匹配格式：任意子域名.主域名.顶级域名
  const normalPattern = /(?:[^.]+\.)*([^.]+\.(?:[a-z]{2,}|[a-z]{2,}\.[a-z]{2,}))$/i;
  const normalMatch = domain.match(normalPattern);

  if (normalMatch && normalMatch[1]) {
    return normalMatch[1];
  }

  // 如果都不匹配，返回原域名
  return domain;
}

