import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import type { Novel } from 'src/models/novel';
import type { SyosetuNovelInfo, SyosetuChapter } from 'src/services/scraper/scrapers/syosetu-types';
import type { FetchNovelResult, ParsedChapterInfo, ParsedVolumeInfo } from 'src/services/scraper/types';
import { BaseScraper } from '../core';

/**
 * syosetu.org 小说爬虫服务
 * 用于从 syosetu.org 获取和解析小说信息
 */
export class SyosetuScraper extends BaseScraper {
  private static readonly BASE_URL = 'https://syosetu.org';
  // 匹配所有以 syosetu.org/novel/:bookid 开头的 URL
  private static readonly NOVEL_URL_PATTERN = /^https?:\/\/syosetu\.org\/novel\/(\d+)(?:\/.*)?$/;

  /**
   * 验证 URL 是否为有效的 syosetu.org 小说 URL
   * @param url 要验证的 URL
   * @returns 是否为有效的 URL
   */
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
  private getNovelIndexUrl(url: string): string {
    const novelId = this.extractNovelId(url);
    if (novelId) {
      return `${SyosetuScraper.BASE_URL}/novel/${novelId}/`;
    }
    return url;
  }

  /**
   * 获取并解析小说信息
   * @param url syosetu.org 小说 URL（可以是章节 URL，会自动提取小说主页）
   * @returns Promise<FetchNovelResult> 获取结果
   */
  async fetchNovel(url: string): Promise<FetchNovelResult> {
    try {
      // 验证 URL
      if (!this.isValidUrl(url)) {
        return this.createErrorResult('无效的 syosetu.org 小说 URL');
      }

      // 获取小说主页 URL（如果传入的是章节 URL，需要提取小说主页）
      const novelIndexUrl = this.getNovelIndexUrl(url);

      // 获取页面
      const html = await this.fetchPage(novelIndexUrl, '/api/syosetu');

      // 解析页面（使用小说主页 URL 作为 baseUrl）
      const novelInfo = this.parseNovelPage(html, novelIndexUrl);

      // 转换为 Novel 格式
      const novel = this.convertToNovel(novelInfo);

      return this.createSuccessResult(novel);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error('获取小说信息时发生未知错误'),
      );
    }
  }

  /**
   * 获取章节内容
   * @param chapterUrl 章节 URL
   * @returns Promise<string> 章节内容
   * @throws {Error} 如果获取失败
   */
  async fetchChapterContent(chapterUrl: string): Promise<string> {
    const html = await this.fetchPage(chapterUrl, '/api/syosetu');
    const paragraphs = this.extractParagraphsFromHtml(html);
    return this.mergeParagraphs(paragraphs);
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
    let contentElement = $('#honbun').first();
    if (contentElement.length === 0) {
      contentElement = $('div.ss').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('#novel_honbun').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('.novel_honbun').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('#novel_content').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('.novel_content').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('main').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('article').first();
    }

    if (contentElement.length === 0) {
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

      // 检查段落是否为空（没有任何文本内容）
      // 对于空的 <p> 标签（如 <p id="2"></p>），直接添加换行符
      // 空段落被视为换行符
      const paragraphHtml = $p.html() || '';
      const paragraphText = $p.text() || '';

      // 如果段落只包含空白字符（空格、制表符、换行符等），视为空段落
      const hasOnlyWhitespace = paragraphText.trim().length === 0;

      // 如果 HTML 也为空或只包含空白字符，也视为空段落
      const htmlIsEmpty = paragraphHtml.trim().length === 0;

      if (hasOnlyWhitespace || htmlIsEmpty) {
        // 空的 <p> 标签被视为换行
        // 每个空的 <p> 标签产生一个换行符
        // 连续的空段落（如 <p id="78"></p><p id="79"></p>）会产生两个换行符
        paragraphs.push('\n');
        return; // 跳过后续处理
      }

      // 移除段落内的链接（可能是导航链接）
      $p.find('a').each((_, linkEl) => {
        const $link = $(linkEl);
        const linkText = $link.text().trim();
        if (/目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(linkText)) {
          $link.remove();
        }
      });

      // 提取段落文本，保留内部格式（如 <br> 换行）
      // 使用递归函数来正确处理所有节点，包括嵌套标签
      const extractParagraphText = (element: cheerio.Cheerio<any>): string => {
        let text = '';

        element.contents().each((_, node: any) => {
          const nodeType = String(node.type);
          if (nodeType === 'text') {
            // 文本节点，直接添加（保留原始文本，包括空格）
            const nodeText = $(node).text();
            text += nodeText;
          } else if (nodeType === 'tag') {
            const $node = $(node);
            const tagName = node.tagName?.toLowerCase() || '';

            if (tagName === 'br') {
              // <br> 标签转换为换行
              text += '\n';
            } else if (tagName === 'p') {
              // 嵌套的 <p> 标签，递归提取并添加换行
              const innerText = extractParagraphText($node);
              if (innerText.trim()) {
                text += innerText + '\n';
              } else {
                // 嵌套的空 <p> 标签也添加换行
                text += '\n';
              }
            } else {
              // 其他标签，递归提取内容（保留内部结构）
              const innerText = extractParagraphText($node);
              if (innerText) {
                text += innerText;
              }
            }
          }
        });

        return text;
      };

      const extractedText = extractParagraphText($p);

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
      // 使用递归方法提取所有文本
      const extractTextWithFormatting = (element: cheerio.Cheerio<any>): string => {
        let text = '';

        element.contents().each((_, node: any) => {
          const nodeType = String(node.type);
          if (nodeType === 'text') {
            const nodeText = $(node).text();
            text += nodeText;
          } else if (nodeType === 'tag') {
            const $node = $(node);
            const tagName = node.tagName?.toLowerCase() || '';

            if (tagName === 'br') {
              text += '\n';
            } else if (tagName === 'p' || tagName === 'div') {
              const innerText = extractTextWithFormatting($node);
              if (innerText.trim()) {
                text += innerText;
                if (tagName === 'p') {
                  text += '\n';
                }
              } else if (tagName === 'p') {
                // 空的 <p> 标签也添加换行
                text += '\n';
              }
            } else {
              const innerText = extractTextWithFormatting($node);
              if (innerText.trim()) {
                text += innerText;
              }
            }
          }
        });

        return text;
      };

      const fallbackText = extractTextWithFormatting(contentElement);
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
  private mergeParagraphs(paragraphs: string[]): string {
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

    // 提取标题
    let title = $('h1').first().text().trim();
    if (!title) {
      title = $('title').first().text().trim();
    }
    if (!title) {
      title = $('.novel_title').first().text().trim();
    }
    if (!title) {
      title = '未知标题';
    }

    // 提取作者
    let author: string | undefined = $('a[href*="/user/"]').first().text().trim();
    if (!author) {
      author = $('.novel_writername').first().text().trim();
    }
    if (!author) {
      author = $('a[href*="user"]').first().text().trim();
    }
    if (!author) {
      author = undefined;
    }

    // 提取描述
    let description: string | undefined = $('.novel_ex').first().text().trim();
    if (!description) {
      description = $('.novel_description').first().text().trim();
    }
    if (!description) {
      description = $('meta[name="description"]').attr('content')?.trim();
    }

    // 提取标签
    const tags: string[] = [];
    $('.tag, .novel_tag, [class*="tag"]').each((_, el) => {
      const tagText = $(el).text().trim();
      if (tagText) {
        tags.push(tagText);
      }
    });

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

        // 检查是否是卷标题行
        // 卷标题行的特征：有 <td colspan="2"> 且包含 <strong> 标签，且没有章节链接
        let volumeTitle: string | null = null;
        cells.each((_, cell: any) => {
          const $cell = $(cell);
          const colspan = $cell.attr('colspan');
          const hasLink = $cell.find('a[href*=".html"]').length > 0;
          const hasStrong = $cell.find('strong').length > 0;
          // 如果有 colspan="2" 且有 <strong> 标签且没有章节链接，可能是卷标题
          if (
            colspan &&
            (colspan === '2' || parseInt(colspan, 10) >= 2) &&
            hasStrong &&
            !hasLink &&
            !volumeTitle
          ) {
            // 提取卷标题（从 <strong> 标签中提取，如果没有则从单元格文本中提取）
            const strongText = $cell.find('strong').first().text().trim();
            const cellText = $cell.text().trim();
            volumeTitle = strongText || cellText;
          }
        });

        if (volumeTitle) {
          // 这是一个卷标题行
          // 保存当前卷的信息（如果有的话）
          if (currentVolumeTitle !== null) {
            volumeInfo.push({
              title: currentVolumeTitle,
              startIndex: currentVolumeStartIndex,
            });
          }
          // 设置新的当前卷标题和起始索引
          currentVolumeTitle = volumeTitle;
          currentVolumeStartIndex = chapterIndex; // 新卷从当前章节索引开始
          // 注意：这里不更新 chapterIndex，因为卷标题行本身不是章节
        } else {
          // 检查是否是章节行（有章节链接）
          const link = $row.find('a[href*=".html"]').first();
          if (link.length > 0) {
            const href = link.attr('href');
            const chapterTitle = link.text().trim();

            if (href && chapterTitle && !href.includes('index.html')) {
              // 构建完整 URL
              let fullUrl: string;
              if (href.startsWith('http')) {
                // 已经是完整 URL
                fullUrl = href;
              } else if (href.startsWith('/')) {
                // 绝对路径
                fullUrl = `${SyosetuScraper.BASE_URL}${href}`;
              } else if (href.startsWith('./')) {
                // 相对路径（如 ./1.html），需要基于 baseUrl 解析
                const baseUrlObj = new URL(baseUrl);
                fullUrl = new URL(href, baseUrlObj.href).href;
              } else {
                // 相对路径（如 1.html），需要基于 baseUrl 解析
                const baseUrlObj = new URL(baseUrl);
                fullUrl = new URL(href, baseUrlObj.href).href;
              }

              // 查找日期（通常在最后一列）
              // syosetu.org 的日期格式可能是：
              // - "2025年05月16日(金) 08:13" (创建时间，但也作为 lastUpdated)
              // - "2025年05月16日(金) 08:13(改)" (更新时间)
              // 无论是否有 (改) 标记，都设置 lastUpdated，因为这是从网站获取的最新信息
              let date: string | undefined;
              let lastUpdated: string | undefined;
              if (cells.length >= 2) {
                // 日期通常在最后一列
                const dateText = cells.last().text().trim();
                if (dateText && dateText.match(/\d{4}年\d{1,2}月\d{1,2}日/)) {
                  // 检查是否包含 "(改)" 标记
                  if (dateText.includes('(改)')) {
                    // 如果有 "(改)"，这是明确的更新时间
                    lastUpdated = dateText;
                    // 通常这种情况下，date 保持 undefined（因为只有更新时间）
                  } else {
                    // 没有 "(改)"，这是创建时间，但也作为 lastUpdated（因为这是从网站获取的最新信息）
                    date = dateText;
                    lastUpdated = dateText; // 导入时，所有从网站获取的日期都作为 lastUpdated
                  }
                }
              }

              const chapter: SyosetuChapter = {
                title: chapterTitle,
                url: fullUrl,
              };
              if (date) {
                chapter.date = date;
              }
              if (lastUpdated) {
                chapter.lastUpdated = lastUpdated;
              }
              chapters.push(chapter);
              chapterIndex++;
            }
          }
        }
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
          let fullUrl: string;
          if (href.startsWith('http')) {
            // 已经是完整 URL
            fullUrl = href;
          } else if (href.startsWith('/')) {
            // 绝对路径
            fullUrl = `${SyosetuScraper.BASE_URL}${href}`;
          } else if (href.startsWith('./')) {
            // 相对路径（如 ./1.html），需要基于 baseUrl 解析
            const baseUrlObj = new URL(baseUrl);
            fullUrl = new URL(href, baseUrlObj.href).href;
          } else {
            // 相对路径（如 1.html），需要基于 baseUrl 解析
            const baseUrlObj = new URL(baseUrl);
            fullUrl = new URL(href, baseUrlObj.href).href;
          }
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
   * 将 syosetu.org 小说信息转换为 Novel 格式
   * @param info syosetu.org 小说信息
   * @returns Novel 对象
   */
  private convertToNovel(info: SyosetuNovelInfo): Novel {
    const now = new Date();

    // 将 SyosetuChapter 转换为 ParsedChapterInfo
    const parsedChapters: ParsedChapterInfo[] = info.chapters.map((chapter) => {
      const parsedChapter: ParsedChapterInfo = {
        title: chapter.title,
        url: chapter.url,
      };
      if (chapter.date) {
        parsedChapter.date = chapter.date;
      }
      if (chapter.lastUpdated) {
        parsedChapter.lastUpdated = chapter.lastUpdated;
      }
      return parsedChapter;
    });

    // 将 SyosetuVolumeInfo 转换为 ParsedVolumeInfo
    const parsedVolumes: ParsedVolumeInfo[] | undefined = info.volumes?.map((volume) => ({
      title: volume.title,
      startIndex: volume.startIndex,
    }));

    // 使用基类的通用方法将章节分组到卷中
    const volumes = this.groupChaptersIntoVolumes(parsedChapters, parsedVolumes, '正文');

    // Novel 的 ID 使用完整的 uuidv4（不在短 ID 范围内）
    // 注意：根据要求，只有 chapter/volume/paragraph/translation/note/terminology/character settings 使用短 ID
    const novel: Novel = {
      id: uuidv4(),
      title: info.title,
      volumes,
      webUrl: [info.webUrl],
      lastEdited: now,
      createdAt: now,
    };

    if (info.author) {
      novel.author = info.author;
    }

    if (info.description) {
      novel.description = info.description;
    }

    if (info.tags) {
      novel.tags = info.tags;
    }

    return novel;
  }
}
