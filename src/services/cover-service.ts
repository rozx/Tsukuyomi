import type { Novel } from 'src/models/novel';
import { Theme } from 'src/constants/theme';

/**
 * 封面服务
 * 提供封面相关的工具函数
 */
export class CoverService {
  /**
   * 获取封面颜色配置（基于主题）
   */
  private static getCoverColors() {
    // 从主题获取渐变颜色 - Secondary（影墨）渐变
    const gradient = {
      start: Theme.colors.night[950], // #0F1114
      middle: Theme.colors.night.DEFAULT, // #1C1F26 (Secondary 影墨)
      end: '#2C2F3A', // 渐变结束色（对应 tailwind night.50，用于平滑过渡，Theme 中未定义）
    };

    // Highlight（薄藍）装饰线颜色，30% 透明度
    // 从 translationText 提取 RGB 值，使用不同透明度
    const highlightRgb = this.extractRgbFromRgba(Theme.translationText.DEFAULT);
    const decoration = `rgba(${highlightRgb}, 0.3)`;

    // Primary（月白）文字颜色
    const primaryColor = Theme.colors.primary.DEFAULT; // #E9EDF5
    const primaryRgb = this.hexToRgb(primaryColor);
    const text = {
      primary: `rgba(${primaryRgb}, 0.9)`,
      secondary: `rgba(${primaryRgb}, 0.6)`,
    };

    return {
      gradient,
      decoration,
      text,
    };
  }

  /**
   * 从 rgba 字符串中提取 RGB 值
   */
  private static extractRgbFromRgba(rgba: string): string {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return `${match[1]}, ${match[2]}, ${match[3]}`;
    }
    return '109, 136, 168'; // 默认 Highlight（薄藍）
  }

  /**
   * 将十六进制颜色转换为 RGB 字符串
   */
  private static hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result || !result[1] || !result[2] || !result[3]) {
      return '233, 237, 245'; // 默认 Primary（月白）
    }
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
  }

  // SVG 尺寸常量
  private static readonly COVER_SIZE = {
    width: 200,
    height: 300,
  } as const;

  // 布局常量
  private static readonly LAYOUT = {
    centerX: 100,
    titleY: 120,
    authorY: 240,
    decorationY: {
      top: 40,
      bottom: 260,
    },
    decorationX: {
      start: 20,
      end: 180,
    },
  } as const;

  // 字体常量
  private static readonly FONT = {
    family: 'system-ui, -apple-system, sans-serif',
    title: {
      size: 16,
      weight: 600,
    },
    author: {
      size: 12,
    },
  } as const;

  // 文本处理常量
  private static readonly TEXT = {
    maxLineLength: 10,
    maxLines: 3,
    lineSpacing: 20,
  } as const;

  /**
   * 转义 HTML 特殊字符
   */
  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 将文本分行（每行最多指定字符数）
   */
  private static splitTextIntoLines(text: string, maxLength: number): string[] {
    const lines: string[] = [];
    const chars = text.split('');
    let currentLine = '';

    for (const char of chars) {
      if (char && currentLine.length >= maxLength && char !== ' ') {
        lines.push(currentLine.trim());
        currentLine = char;
      } else if (char) {
        currentLine += char;
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    return lines;
  }

  /**
   * 生成装饰线 SVG 元素
   */
  private static createDecorationLine(y: number): string {
    const { start, end } = this.LAYOUT.decorationX;
    const colors = this.getCoverColors();
    return `<line x1="${start}" y1="${y}" x2="${end}" y2="${y}" stroke="${colors.decoration}" stroke-width="2"/>`;
  }

  /**
   * 生成文本 SVG 元素
   */
  private static createTextElement(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    fontWeight: number | string,
    fill: string,
  ): string {
    return `<text x="${x}" y="${y}" font-family="${this.FONT.family}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
  }

  /**
   * 生成多行标题 SVG 元素
   */
  private static createTitleElement(titleLines: string[]): string {
    const { centerX, titleY } = this.LAYOUT;
    const { size, weight } = this.FONT.title;
    const colors = this.getCoverColors();
    const fill = colors.text.primary;

    const tspanElements = titleLines
      .map((line, i) => `<tspan x="${centerX}" dy="${i === 0 ? '0' : this.TEXT.lineSpacing}">${line}</tspan>`)
      .join('');

    return this.createTextElement(centerX, titleY, tspanElements, size, weight, fill);
  }

  /**
   * 生成默认封面 SVG（基于书籍标题和作者）
   * @param title 书籍标题
   * @param author 作者（可选）
   * @returns 默认封面的 data URL
   */
  static generateDefaultCover(title: string, author?: string): string {
    // 转义 HTML 特殊字符
    const escapedTitle = this.escapeHtml(title || '未命名');
    const escapedAuthor = author ? this.escapeHtml(author) : '';

    // 将标题分行
    const titleLines = this.splitTextIntoLines(escapedTitle, this.TEXT.maxLineLength).slice(
      0,
      this.TEXT.maxLines,
    );

    // 创建 SVG
    const { width, height } = this.COVER_SIZE;
    const colors = this.getCoverColors();
    const { start, middle, end } = colors.gradient;
    const { decorationY } = this.LAYOUT;
    const { centerX, authorY } = this.LAYOUT;
    const { size } = this.FONT.author;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="coverGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${start};stop-opacity:1" />
            <stop offset="50%" style="stop-color:${middle};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${end};stop-opacity:1" />
          </linearGradient>
        </defs>
        <!-- 背景 -->
        <rect width="${width}" height="${height}" fill="url(#coverGrad)"/>
        <!-- 顶部装饰线 -->
        ${this.createDecorationLine(decorationY.top)}
        <!-- 标题 -->
        ${this.createTitleElement(titleLines)}
        <!-- 作者 -->
        ${escapedAuthor ? this.createTextElement(centerX, authorY, escapedAuthor, size, 'normal', colors.text.secondary) : ''}
        <!-- 底部装饰线 -->
        ${this.createDecorationLine(decorationY.bottom)}
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

