import type { Novel } from 'src/models/novel';

/**
 * 封面服务
 * 提供封面相关的工具函数
 */
export class CoverService {
  /**
   * 生成默认封面 SVG（基于书籍标题和作者）
   * @param title 书籍标题
   * @param author 作者（可选）
   * @returns 默认封面的 data URL
   */
  static generateDefaultCover(title: string, author?: string): string {
    // 转义 HTML 特殊字符
    const escapedTitle = (title || '未命名')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const escapedAuthor = (author || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // 将标题分行（每行最多10个字符）
    const titleLines: string[] = [];
    const words = escapedTitle.split('');
    let currentLine = '';
    for (let i = 0; i < words.length; i++) {
      const char = words[i];
      if (char && currentLine.length >= 10 && char !== ' ') {
        titleLines.push(currentLine.trim());
        currentLine = char;
      } else if (char) {
        currentLine += char;
      }
    }
    if (currentLine) {
      titleLines.push(currentLine.trim());
    }
    const displayTitle = titleLines.slice(0, 3).join('\n');

    // 创建 SVG，使用书籍的实际信息
    const svg = `
      <svg width="200" height="300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="coverGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
          </linearGradient>
        </defs>
        <!-- 背景 -->
        <rect width="200" height="300" fill="url(#coverGrad)"/>
        <!-- 顶部装饰线 -->
        <line x1="20" y1="40" x2="180" y2="40" stroke="rgba(85,103,242,0.3)" stroke-width="2"/>
        <!-- 标题 -->
        <text x="100" y="120" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="rgba(246,243,209,0.9)" text-anchor="middle" dominant-baseline="middle">
          ${displayTitle
            .split('\n')
            .map((line, i) => `<tspan x="100" dy="${i === 0 ? '0' : '20'}">${line}</tspan>`)
            .join('')}
        </text>
        <!-- 作者 -->
        ${escapedAuthor ? `<text x="100" y="240" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="rgba(246,243,209,0.6)" text-anchor="middle" dominant-baseline="middle">${escapedAuthor}</text>` : ''}
        <!-- 底部装饰线 -->
        <line x1="20" y1="260" x2="180" y2="260" stroke="rgba(85,103,242,0.3)" stroke-width="2"/>
      </svg>
    `
      .trim()
      .replace(/\s+/g, ' ');

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }

  /**
   * 获取书籍的封面 URL（如果有自定义封面则返回，否则返回默认封面）
   * @param book 书籍对象
   * @returns 封面 URL
   */
  static getCoverUrl(book: Novel): string {
    if (book.cover?.url) {
      return book.cover.url;
    }
    // 生成默认封面
    return CoverService.generateDefaultCover(book.title, book.author);
  }
}

