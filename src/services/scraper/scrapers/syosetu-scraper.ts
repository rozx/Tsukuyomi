import * as cheerio from 'cheerio';
import type { Novel } from 'src/models/novel';
import type { SyosetuNovelInfo, SyosetuChapter } from 'src/services/scraper/scrapers/syosetu-types';
import { BaseScraper } from '../core';
import {
  extractDescriptionText,
  extractParagraphText,
  extractTextWithFormatting,
} from '../core/cheerio-text-extract';

/**
 * 从一批 Cheerio 链接/节点中提取 trim 后的文本，
 * 去重后追加到 `tags` 数组（仅在文本非空、且不重复时 push）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectUniqueTagTexts($: cheerio.CheerioAPI, nodes: cheerio.Cheerio<any>, tags: string[]): void {
  nodes.each((_, el) => {
    const tagText = $(el).text().trim();
    if (tagText && !tags.includes(tagText)) {
      tags.push(tagText);
    }
  });
}

/** 递归提取文本；<br> 转换为 \n；跳过 img 占位锚点。提取描述/章节正文共用逻辑 */
function extractTextWithBrAsNewline(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
): string {
  let text = '';
  element.contents().each((_, node: any) => {
    const nodeType = String(node.type);
    if (nodeType === 'text') {
      text += $(node).text();
    } else if (nodeType === 'tag') {
      const $node = $(node);
      const tagName = node.tagName?.toLowerCase() || '';
      if (tagName === 'br') {
        text += '\n';
      } else if (tagName === 'a' && $node.attr('name') === 'img') {
        // 跳过图片链接占位（如【挿絵表示】）
        return;
      } else {
        const innerText = extractTextWithBrAsNewline($, $node);
        if (innerText) text += innerText;
      }
    }
  });
  return text;
}

/** 按回退顺序提取页面标题；均为空时返回「未知标题」 */
function extractSyosetuTitle($: cheerio.CheerioAPI): string {
  const selectors = ['h1', 'title', '.novel_title'];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }
  return '未知标题';
}

/** 按回退顺序提取作者；均为空时返回 undefined */
function extractSyosetuAuthor($: cheerio.CheerioAPI): string | undefined {
  const selectors = ['a[href*="/user/"]', '.novel_writername', 'a[href*="user"]'];
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }
  return undefined;
}

/**
 * 优先从 div#maind 内 .ss div 提取完整描述（绕过 meta 截断）。未能识别时返回 undefined。
 */
function extractSyosetuPrimaryDescription($: cheerio.CheerioAPI): string | undefined {
  const maind = $('#maind');
  if (maind.length === 0) return undefined;
  const ssDivs = maind.find('.ss');
  if (ssDivs.length >= 2) {
    // 跳过第一个（标题/作者部分），提取第二个
    const secondSsDiv = ssDivs.eq(1);
    if (secondSsDiv.length === 0) return undefined;
    const text = extractTextWithBrAsNewline($, secondSsDiv).trim();
    // 太短可能不是描述
    return text && text.length >= 10 ? text : undefined;
  }
  if (ssDivs.length === 1) {
    // 单个 .ss div：按对话特征判断是否为描述
    const ssDiv = ssDivs.first();
    const divText = ssDiv.text();
    if (divText.length > 50 && (divText.includes('「') || divText.includes('」'))) {
      return extractTextWithBrAsNewline($, ssDiv).trim() || undefined;
    }
  }
  return undefined;
}

/**
 * 检查 tr 是否为卷标题行。卷标题行特征：td 带 colspan≥2、含 <strong>、且不含章节链接。
 */
function detectSyosetuVolumeTitle(
  $: cheerio.CheerioAPI,
  cells: cheerio.Cheerio<any>,
): string | null {
  let volumeTitle: string | null = null;
  cells.each((_, cell: any) => {
    if (volumeTitle) return;
    const $cell = $(cell);
    const colspan = $cell.attr('colspan');
    const hasLink = $cell.find('a[href*=".html"]').length > 0;
    const hasStrong = $cell.find('strong').length > 0;
    if (
      colspan &&
      (colspan === '2' || parseInt(colspan, 10) >= 2) &&
      hasStrong &&
      !hasLink
    ) {
      // 优先 <strong>，否则回退整格文本
      const strongText = $cell.find('strong').first().text().trim();
      const cellText = $cell.text().trim();
      volumeTitle = strongText || cellText;
    }
  });
  return volumeTitle;
}

/**
 * 将 href 解析为完整 URL。支持 http / 绝对 / ./ / 相对 四种形式。
 */
function resolveSyosetuHref(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `${SyosetuScraper.BASE_URL}${href}`;
  // ./ 或相对路径都走同一解析分支
  const baseUrlObj = new URL(baseUrl);
  return new URL(href, baseUrlObj.href).href;
}

/**
 * 从章节行最后一列提取日期（支持 "(改)" 标记）。无 (改) 时 date 与 lastUpdated 一致。
 */
function extractSyosetuChapterDates(
  cells: cheerio.Cheerio<any>,
): { date?: string; lastUpdated?: string } {
  if (cells.length < 2) return {};
  const dateText = cells.last().text().trim();
  if (!dateText || !dateText.match(/\d{4}年\d{1,2}月\d{1,2}日/)) return {};
  if (dateText.includes('(改)')) {
    // 明确的更新时间；date 保持 undefined
    return { lastUpdated: dateText };
  }
  // 创建时间，但也作为 lastUpdated（站点获取的最新信息）
  return { date: dateText, lastUpdated: dateText };
}

/**
 * 解析单个章节 tr：不是章节行（无 .html 链接 / 是 index.html）时返回 null。
 */
function parseSyosetuChapterRow(
  $row: cheerio.Cheerio<any>,
  cells: cheerio.Cheerio<any>,
  baseUrl: string,
): SyosetuChapter | null {
  const link = $row.find('a[href*=".html"]').first();
  if (link.length === 0) return null;
  const href = link.attr('href');
  const chapterTitle = link.text().trim();
  if (!href || !chapterTitle || href.includes('index.html')) return null;

  const fullUrl = resolveSyosetuHref(href, baseUrl);
  const chapter: SyosetuChapter = { title: chapterTitle, url: fullUrl };
  const dates = extractSyosetuChapterDates(cells);
  if (dates.date) chapter.date = dates.date;
  if (dates.lastUpdated) chapter.lastUpdated = dates.lastUpdated;
  return chapter;
}

/**
 * syosetu.org 小说爬虫服务
 * 用于从 syosetu.org 获取和解析小说信息
 */
export class SyosetuScraper extends BaseScraper<SyosetuNovelInfo> {
  private static readonly BASE_URL = 'https://syosetu.org';
  // 匹配所有以 syosetu.org/novel/:bookid 开头的 URL
  private static readonly NOVEL_URL_PATTERN = /^https?:\/\/syosetu\.org\/novel\/(\d+)(?:\/.*)?$/;

  /**
   * 验证 URL 是否为有效的 syosetu.org 小说 URL
   * @param url 要验证的 URL
   * @returns 是否为有效的 URL
   */
  // fallow-ignore-next-line unused-class-member
  isValidUrl(url: string): boolean {
    return SyosetuScraper.NOVEL_URL_PATTERN.test(url);
  }

  /**
   * 从 URL 中提取小说 ID
   * @param url syosetu.org 小说 URL
   * @returns 小说 ID，如果无效则返回 null
   */
  extractNovelId(url: string): string | null {
    const match = url.match(SyosetuScraper.NOVEL_URL_PATTERN);
    return match?.[1] ?? null;
  }

  /**
   * 从 URL 中提取小说主页 URL（用于获取章节列表）
   * @param url syosetu.org 小说 URL（可能是章节 URL）
   * @returns 小说主页 URL
   */
  protected override getNovelIndexUrl(url: string): string {
    const novelId = this.extractNovelId(url);
    if (novelId) {
      return `${SyosetuScraper.BASE_URL}/novel/${novelId}/`;
    }
    return url;
  }

  protected override getInvalidUrlError(): string {
    return '无效的 syosetu.org 小说 URL';
  }

  /**
   * 从小说主页 URL 拉取 HTML 并解析为 SyosetuNovelInfo
   */
  protected override async parseNovelInfoFromUrl(novelIndexUrl: string): Promise<SyosetuNovelInfo> {
    // syosetu.org 在浏览器环境下通过 /api/syosetu 服务器代理访问
    const html = await this.fetchPage(novelIndexUrl, '/api/syosetu');
    return this.parseNovelPage(html, novelIndexUrl);
  }

  /**
   * 从 HTML 中提取段落（实现抽象方法）
   * @param html 章节 HTML 内容
   * @returns 段落数组，每个元素是一个段落文本
   */
  protected extractParagraphsFromHtml(html: string): string[] {
    const $ = cheerio.load(html);

    // 提取正文内容（按优先级查找）
    // syosetu.org 的章节内容结构：
    // <div class="ss">
    //   ... (标题、导航等)
    //   <div id="honbun">
    //     <p id="0">...</p>
    //     <p id="1">...</p>
    //     <p id="2"></p> (空段落 = 换行)
    //   </div>
    // </div>
    // 优先查找 <div id="honbun">，这是正文容器
    const contentElement = this.selectContentElement($, [
      '#honbun',
      'div.ss',
      '#novel_honbun',
      '.novel_honbun',
      '#novel_content',
      '.novel_content',
      'main',
      'article',
    ]);

    if (!contentElement) {
      throw new Error('无法找到章节正文内容');
    }

    // 移除不需要的元素（脚本、样式、导航、广告等）
    contentElement
      .find(
        'script, style, noscript, nav, .navigation, .nav, .menu, .ad, .advertisement, .ads, header, footer, .header, .footer',
      )
      .remove();

    // 移除可能包含导航链接的元素
    contentElement
      .find('a[href*="index"], a[href*="目次"], a[href*="次"], a[href*="前"]')
      .each((_, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        // 如果是导航链接（包含"目次"、"前"、"次"等），移除
        if (/目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(text)) {
          $el.remove();
        }
      });

    // 提取内容，按照 syosetu.org 的实际结构：
    // 如果 contentElement 是 <div id="honbun">，直接提取其中的 <p> 标签
    // 如果 contentElement 是 <div class="ss">，需要先找到 <div id="honbun">
    const paragraphs: string[] = [];

    // 如果当前元素是 <div class="ss">，尝试找到其中的 <div id="honbun">
    let honbunElement = contentElement;
    if (contentElement.is('div.ss') || contentElement.hasClass('ss')) {
      const honbun = contentElement.find('#honbun').first();
      if (honbun.length > 0) {
        honbunElement = honbun;
      }
    }

    // 提取标题（在 <div class="ss"> 中，但在 <div id="honbun"> 之前）
    // 标题在 <span style="font-size:120%"> 中
    if (contentElement.is('div.ss') || contentElement.hasClass('ss')) {
      const titleSpan = contentElement.find('span[style*="font-size:120%"]').first();
      if (titleSpan.length > 0) {
        // 提取标题文本，保留 <br> 换行
        let titleText = '';
        titleSpan.contents().each((_, node: any) => {
          const nodeType = String(node.type);
          if (nodeType === 'text') {
            titleText += $(node).text();
          } else if (nodeType === 'tag' && node.tagName?.toLowerCase() === 'br') {
            titleText += '\n';
          }
        });
        if (titleText.trim()) {
          paragraphs.push(titleText.trim());
          paragraphs.push(''); // 标题后添加空行
        }
      }
    }

    // 提取所有段落 <p> 标签（从 honbunElement 中提取）
    honbunElement.find('p').each((_, el: any) => {
      const $p = $(el);

      // 空的 <p> 标签（如 <p id="2"></p>）视为换行
      // 连续的空段落（如 <p id="78"></p><p id="79"></p>）会产生多个换行符
      if (this.isEmptyParagraphElement($p)) {
        paragraphs.push('\n');
        return;
      }

      // 移除段落内的链接（可能是导航链接）
      this.removeNavigationLinks(
        $,
        $p,
        'a',
        /目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</,
      );

      // 提取段落文本，保留内部格式（如 <br> 换行）
      const extractedText = extractParagraphText($, $p);

      // 保持原始段落格式，只移除导航文本
      // 不清理空白字符，以保持原始格式（包括缩进等）
      const cleanedText = extractedText;

      // 检查是否为导航文本
      if (!/目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(cleanedText.trim())) {
        // 非导航文本，正常添加（保持原始格式）
        paragraphs.push(cleanedText);
      }
    });

    // 如果没有找到 <p> 标签，回退到原来的方法
    const hasTitle = paragraphs.length > 0 && paragraphs[0] !== '\n' && paragraphs[0] !== '';
    if (paragraphs.length === (hasTitle ? 2 : 0)) {
      const fallbackText = extractTextWithFormatting($, contentElement);
      const trimmedFallback = fallbackText.trim();

      if (trimmedFallback) {
        // 按行分割，过滤掉导航文本
        const lines = trimmedFallback.split('\n').filter((line) => {
          const trimmedLine = line.trim();
          return (
            trimmedLine && !/目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(trimmedLine)
          );
        });

        if (lines.length > 0) {
          paragraphs.push(...lines);
        }
      }
    }

    return paragraphs;
  }

  /**
   * 合并段落数组为完整内容（syosetu 特定方法）
   * @param paragraphs 段落数组
   * @returns 合并后的内容字符串
   */
  protected mergeParagraphs(paragraphs: string[]): string {
    // 合并段落
    // 每个段落（无论是普通段落还是空段落）都应该产生换行符
    // 空的 <p> 标签只产生换行符，普通段落在内容后添加换行符
    let content = '';
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];

      if (paragraph === '\n') {
        // 空段落，直接添加换行符（每个空段落产生一个换行符）
        // 这样连续的空段落（如 <p id="78"></p><p id="79"></p>）会产生两个换行符
        content += '\n';
      } else if (paragraph === '') {
        // 空字符串段落（如标题后的空行），添加换行符
        content += '\n';
      } else {
        // 普通段落：添加段落内容，然后添加换行符
        // 每个 <p> 标签都应该在内容后产生换行符
        content += paragraph;
        content += '\n';
      }
    }

    // 清理内容
    // 注意：保持原始文本的格式，包括换行符的数量、位置和缩进
    // 只移除明显的导航文本，不修改任何格式（包括空白字符和换行符）

    // 移除导航文本模式（更全面的匹配）
    // 只在整行匹配时移除，避免误删正文内容
    const navigationPatterns = [
      /^目\s*次\s*次の話\s*>>?\s*$/i,
      /^前\s*の\s*話\s*目\s*次\s*次\s*の\s*話\s*$/i,
      /^<<\s*前\s*目\s*次\s*次\s*>>\s*$/i,
    ];

    // 按行处理，只移除完全匹配导航模式的行
    const lines = content.split('\n');
    const filteredLines = lines.filter((line) => {
      const trimmedLine = line.trim();
      // 只移除完全匹配导航模式的行
      return !navigationPatterns.some((pattern) => pattern.test(trimmedLine));
    });
    content = filteredLines.join('\n');

    return content;
  }

  /**
   * 解析小说页面 HTML
   * @param html HTML 内容
   * @param baseUrl 基础 URL（用于构建完整链接）
   * @returns SyosetuNovelInfo 解析后的小说信息
   */
  private parseNovelPage(html: string, baseUrl: string): SyosetuNovelInfo {
    const $ = cheerio.load(html);

    const title = extractSyosetuTitle($);
    const author = extractSyosetuAuthor($);
    let description = extractSyosetuPrimaryDescription($);

    // 如果从 .ss div 中没有提取到描述，回退到其他选择器
    if (!description) {
      description = $('.novel_ex').first().text().trim();
    }
    if (!description) {
      description = $('.novel_description').first().text().trim();
    }
    if (!description) {
      description = $('meta[name="description"]').attr('content')?.trim();
    }
    if (!description) {
      // 最后尝试从 og:description meta 标签提取（通常会被截断，所以优先级最低）
      const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
      // 只有当 og:description 没有被截断（不以"…"结尾）时才使用
      if (ogDesc && !ogDesc.endsWith('…')) {
        description = ogDesc;
      }
    }

    // 提取标签
    const tags: string[] = [];

    // 首先尝试从第一个 .ss div 中提取标签（格式：タグ：<a class="alert_color">...</a>）
    const firstSsDiv = $('.ss').first();
    if (firstSsDiv.length > 0) {
      // 查找包含 "タグ：" 文本的节点
      let foundTagLabel = false;
      firstSsDiv.contents().each((_, node: any) => {
        const nodeType = String(node.type);
        if (nodeType === 'text') {
          const text = $(node).text();
          if (text.includes('タグ：') || text.includes('タグ:')) {
            foundTagLabel = true;
          }
        } else if (nodeType === 'tag' && foundTagLabel) {
          const $node = $(node);
          const tagName = node.tagName?.toLowerCase() || '';
          // 查找 class="alert_color" 的链接
          if (tagName === 'a' && $node.hasClass('alert_color')) {
            const tagText = $node.text().trim();
            if (tagText && !tags.includes(tagText)) {
              tags.push(tagText);
            }
          }
        }
      });

      // 如果找到了标签，也尝试从该 div 中查找所有 alert_color 链接（以防万一）
      if (tags.length === 0) {
        collectUniqueTagTexts($, firstSsDiv.find('a.alert_color'), tags);
      }
    }

    // 回退到原有的选择器
    if (tags.length === 0) {
      collectUniqueTagTexts($, $('.tag, .novel_tag, [class*="tag"]'), tags);
    }

    // 提取章节列表和卷信息
    const chapters: SyosetuChapter[] = [];
    const volumeInfo: Array<{ title: string; startIndex: number }> = [];

    // 查找章节表格（syosetu.org 通常使用 table 标签）
    const chapterTable = $('table').first();

    if (chapterTable.length > 0) {
      let currentVolumeTitle: string | null = null;
      let currentVolumeStartIndex = 0; // 当前卷的起始章节索引
      let chapterIndex = 0;

      // 查找所有行
      chapterTable.find('tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        const volumeTitle = detectSyosetuVolumeTitle($, cells);
        if (volumeTitle) {
          // 卷标题行：保存前一卷并切换到新卷（chapterIndex 不更新）
          if (currentVolumeTitle !== null) {
            volumeInfo.push({
              title: currentVolumeTitle,
              startIndex: currentVolumeStartIndex,
            });
          }
          currentVolumeTitle = volumeTitle;
          currentVolumeStartIndex = chapterIndex;
          return;
        }
        const parsed = parseSyosetuChapterRow($row, cells, baseUrl);
        if (!parsed) return;
        chapters.push(parsed);
        chapterIndex++;
      });

      // 保存最后一个卷的信息
      if (currentVolumeTitle !== null) {
        volumeInfo.push({
          title: currentVolumeTitle,
          startIndex: currentVolumeStartIndex,
        });
      }
    }

    // 如果没有找到章节，尝试从页面中查找所有可能的章节链接
    if (chapters.length === 0) {
      $('a[href*=".html"]').each((_, el) => {
        const link = $(el);
        const href = link.attr('href');
        const text = link.text().trim();
        // 过滤掉明显不是章节的链接
        if (
          href &&
          text &&
          !href.includes('index') &&
          !href.includes('novel') &&
          !href.includes('user') &&
          !href.includes('search') &&
          !href.includes('rank')
        ) {
          // 构建完整 URL
          const fullUrl = this.resolveChapterUrl(href, baseUrl);
          chapters.push({
            title: text,
            url: fullUrl,
          });
        }
      });
    }

    const result: SyosetuNovelInfo = {
      title,
      chapters,
      webUrl: baseUrl,
    };

    if (author) {
      result.author = author;
    }

    if (description) {
      result.description = description;
    }

    if (tags.length > 0) {
      result.tags = tags;
    }

    // 如果有卷信息，添加到结果中
    if (volumeInfo.length > 0) {
      result.volumes = volumeInfo;
    }

    return result;
  }

  /**
   * 将章节链接的 href 解析为完整 URL
   * 支持四种情况：
   * - 已是完整 URL（以 http 开头）
   * - 绝对路径（以 / 开头），基于 BASE_URL 拼接
   * - 显式相对路径（以 ./ 开头），基于 baseUrl 解析
   * - 其他相对路径（如 1.html），基于 baseUrl 解析
   */
  private resolveChapterUrl(href: string, baseUrl: string): string {
    if (href.startsWith('http')) {
      // 已经是完整 URL
      return href;
    }
    if (href.startsWith('/')) {
      // 绝对路径
      return `${SyosetuScraper.BASE_URL}${href}`;
    }
    if (href.startsWith('./')) {
      // 相对路径（如 ./1.html），需要基于 baseUrl 解析
      const baseUrlObj = new URL(baseUrl);
      return new URL(href, baseUrlObj.href).href;
    }
    // 相对路径（如 1.html），需要基于 baseUrl 解析
    const baseUrlObj = new URL(baseUrl);
    return new URL(href, baseUrlObj.href).href;
  }

  /**
   * 将 syosetu.org 小说信息转换为 Novel 格式
   * @param info syosetu.org 小说信息
   * @returns Novel 对象
   */
  protected override convertToNovel(info: SyosetuNovelInfo): Novel {
    return this.buildNovelFromParsedInfo(info);
  }
}
