import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
const HTML_PAGE = /<(!doctype|html|head|body)\b/i;
const LIMIT = 300;

/**
 * 把错误整理成可显示、可保存的简短说明。模型服务或代理有时返回整页 HTML（如网关错误页），
 * 只保留状态码与页面标题，避免把整张网页写进任务记录或界面。
 */
export function conciseErrorText(raw: string, locale: AppLocale = 'zh-CN'): string {
  let text = raw;
  if (HTML_PAGE.test(text)) {
    const status = /^\s*(\d{3})\b/.exec(text)?.[1];
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.trim();
    text = [status, title || translateText(locale, 'aiImportErrors.htmlError')]
      .filter(Boolean)
      .join(' ');
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > LIMIT ? `${text.slice(0, LIMIT)}…` : text;
}
