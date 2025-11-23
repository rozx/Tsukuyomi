import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import type { Novel, Chapter, Translation } from 'src/types/novel';
import type { FetchNovelResult, ParsedChapterInfo, ParsedVolumeInfo } from 'src/types/scraper';
import { BaseScraper } from '../core';
import type { UniqueIdGenerator } from 'src/utils/id-generator';
import { generateShortId } from 'src/utils/id-generator';

/**
 * ncode.syosetu.com 小说爬虫服务
 * 用于从 ncode.syosetu.com 获取和解析小说信息
 * 注意：ncode.syosetu.com 和 syosetu.org 是两个不同的网站
 */
export class NcodeSyosetuScraper extends BaseScraper {
  protected override useProxy: boolean = false; // ncode.syosetu.com 不使用 AllOrigins 代理

  protected static readonly BASE_URL = 'https://ncode.syosetu.com';
  // 匹配 ncode.syosetu.com 的小说 URL
  // 格式：https://ncode.syosetu.com/{novel_id}/ 或 https://ncode.syosetu.com/{novel_id}/{chapter_id}
  // novel_id 格式：n + 5-6 位字符（如 n7637dj）
  protected static readonly NOVEL_URL_PATTERN =
    /^https?:\/\/ncode\.syosetu\.com\/(n\w{5,6})(?:\/(\d+))?(?:\/.*)?$/;

  /**
   * 验证 URL 是否为有效的 ncode.syosetu.com 小说 URL
   * @param url 要验证的 URL
   * @returns 是否为有效的 URL
   */
  isValidUrl(url: string): boolean {
    return NcodeSyosetuScraper.NOVEL_URL_PATTERN.test(url);
  }

  /**
   * 从 URL 中提取小说 ID
   * @param url ncode.syosetu.com 小说 URL
   * @returns 小说 ID，如果无效则返回 null
   */
  extractNovelId(url: string): string | null {
    const match = url.match(NcodeSyosetuScraper.NOVEL_URL_PATTERN);
    return match?.[1] ?? null;
  }

  /**
   * 从 URL 中提取小说主页 URL（用于获取章节列表）
   * @param url ncode.syosetu.com 小说 URL（可能是章节 URL）
   * @returns 小说主页 URL
   */
  protected getNovelIndexUrl(url: string): string {
    const novelId = this.extractNovelId(url);
    if (novelId) {
      return `${NcodeSyosetuScraper.BASE_URL}/${novelId}/`;
    }
    return url;
  }

  /**
   * 获取并解析小说信息（支持分页获取所有章节）
   * @param url ncode.syosetu.com 小说 URL（可以是章节 URL，会自动提取小说主页）
   * @returns Promise<FetchNovelResult> 获取结果
   */
  async fetchNovel(url: string): Promise<FetchNovelResult> {
    try {
      // 验证 URL
      if (!this.isValidUrl(url)) {
        return this.createErrorResult('无效的 ncode.syosetu.com 小说 URL');
      }

      // 获取小说主页 URL（如果传入的是章节 URL，需要提取小说主页）
      const novelIndexUrl = this.getNovelIndexUrl(url);

      // 获取并解析所有页面的章节（支持分页）
      const novelInfo = await this.parseNovelPageWithPagination(novelIndexUrl);

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
    const html = await this.fetchPage(chapterUrl);
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

    // 使用指定的 CSS 选择器提取章节内容
    // 章节内容：body > div.l-container > main > article > div.p-novel__body > div:nth-child(1)
    // 由于 cheerio 可能不完全支持 :nth-child(1)，我们使用更精确的选择器
    let contentElement = $('body > div.l-container > main > article > div.p-novel__body')
      .children()
      .first();

    // 如果找不到，尝试其他方式
    if (contentElement.length === 0) {
      // 尝试直接查找 div.p-novel__body 的第一个子元素
      contentElement = $('div.p-novel__body').children().first();
    }

    if (contentElement.length === 0) {
      // 如果还是找不到，尝试更宽松的选择器
      const alternativeSelectors = [
        'div.p-novel__body > div:first-child',
        '.p-novel__body > div:first-child',
        'article div.p-novel__body > div:first-child',
      ];

      let found = false;
      for (const selector of alternativeSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          contentElement = element as typeof contentElement;
          found = true;
          break;
        }
      }

      if (!found) {
        throw new Error('无法找到章节正文内容');
      }
    }

    // 移除不需要的元素
    contentElement
      .find(
        'script, style, noscript, nav, .navigation, .nav, .menu, .ad, .advertisement, .ads, header, footer, .header, .footer',
      )
      .remove();

    // 提取段落，保留原始格式（包括换行符）
    const paragraphs: string[] = [];

    // 查找所有段落标签，保留原始格式
    const hasParagraphs = contentElement.find('p').length > 0;

    if (hasParagraphs) {
      // 如果有 <p> 标签，逐个提取并保留格式
      contentElement.find('p').each((_, el) => {
        const $p = $(el);

        // 检查段落是否为空（没有任何文本内容）
        const paragraphHtml = $p.html() || '';
        const paragraphText = $p.text() || '';

        // 如果段落只包含空白字符，视为空段落（换行）
        const hasOnlyWhitespace = paragraphText.trim().length === 0;
        const htmlIsEmpty = paragraphHtml.trim().length === 0;

        if (hasOnlyWhitespace || htmlIsEmpty) {
          // 空的 <p> 标签被视为换行
          paragraphs.push('\n');
          return;
        }

        // 提取段落文本，保留内部格式（如 <br> 换行）
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

        // 保留原始段落格式，不清理空白字符
        if (extractedText.trim()) {
          paragraphs.push(extractedText);
        }
      });
    } else {
      // 如果没有 <p> 标签，直接提取所有文本，保留换行符
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

      const fullText = extractTextWithFormatting(contentElement);
      if (fullText.trim()) {
        // 按行分割，保留空行（用于保持格式）
        const lines = fullText.split(/\r?\n/);
        paragraphs.push(...lines);
      }
    }

    if (paragraphs.length === 0) {
      throw new Error('无法找到章节正文内容');
    }

    // 提取作者后记（作者留言）
    // 选择器：body > div.l-container > main > article > div.p-novel__body > div.js-novel-text.p-novel__text.p-novel__text--afterword
    let afterwordElement = $(
      'body > div.l-container > main > article > div.p-novel__body > div.js-novel-text.p-novel__text.p-novel__text--afterword',
    );

    // 如果找不到，尝试其他方式
    if (afterwordElement.length === 0) {
      const alternativeSelectors = [
        'div.p-novel__body > div.js-novel-text.p-novel__text.p-novel__text--afterword',
        'div.p-novel__text--afterword',
        '.p-novel__text--afterword',
      ];

      for (const selector of alternativeSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          afterwordElement = element as typeof afterwordElement;
          break;
        }
      }
    }

    if (afterwordElement.length > 0) {
      // 添加分隔符
      paragraphs.push('');
      paragraphs.push('---');
      paragraphs.push('');

      // 移除不需要的元素
      afterwordElement
        .find(
          'script, style, noscript, nav, .navigation, .nav, .menu, .ad, .advertisement, .ads, header, footer, .header, .footer',
        )
        .remove();

      // 提取后记内容，保留格式
      const extractAfterwordText = (element: cheerio.Cheerio<any>): string => {
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
            } else if (tagName === 'p') {
              const innerText = extractAfterwordText($node);
              if (innerText.trim()) {
                text += innerText + '\n';
              } else {
                text += '\n';
              }
            } else {
              const innerText = extractAfterwordText($node);
              if (innerText.trim()) {
                text += innerText;
              }
            }
          }
        });

        return text;
      };

      const afterwordText = extractAfterwordText(afterwordElement).trim();
      if (afterwordText) {
        // 按行分割后记内容
        const afterwordLines = afterwordText.split(/\r?\n/);
        paragraphs.push(...afterwordLines);
      }
    }

    return paragraphs;
  }

  /**
   * 合并段落数组为完整内容
   * @param paragraphs 段落数组
   * @returns 合并后的内容字符串
   */
  protected mergeParagraphs(paragraphs: string[]): string {
    // 合并段落，保留原始格式
    // 如果段落是 '\n'（空段落标记），直接添加换行符
    // 否则添加段落内容，然后添加换行符
    let content = '';
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      if (paragraph === undefined) {
        continue;
      }

      if (paragraph === '\n') {
        // 空段落，直接添加换行符
        content += '\n';
      } else if (paragraph === '') {
        // 空字符串段落，添加换行符
        content += '\n';
      } else {
        // 普通段落：添加段落内容，然后添加换行符
        content += paragraph;
        // 如果段落本身已经以换行符结尾，不需要再添加
        if (!paragraph.endsWith('\n')) {
          content += '\n';
        }
      }
    }

    return content;
  }

  /**
   * 规范化 URL（用于比较，避免重复）
   * @param url 原始 URL
   * @returns 规范化后的 URL
   */
  protected normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // 确保路径以 / 结尾（Syosetu 对此敏感）
      if (!urlObj.pathname.endsWith('/')) {
        urlObj.pathname += '/';
      }
      // 规范化查询参数（排序并移除空值）
      const params = new URLSearchParams(urlObj.search);
      urlObj.search = params.toString();
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * 获取下一页的 URL
   * @param html 当前页面的 HTML 内容
   * @param currentUrl 当前页面的 URL
   * @returns 下一页的 URL，如果没有下一页则返回 null
   */
  protected getNextPageUrl(html: string, currentUrl: string): string | null {
    const $ = cheerio.load(html);

    // 策略 1: 查找 .c-pager__item--next (新的类名)
    let nextLink = $('.c-pager__item--next');
    if (nextLink.length === 0) {
      // 策略 2: 查找旧的 .novelview_pager-next
      nextLink = $('.novelview_pager-next');
    }
    if (nextLink.length === 0) {
      // 策略 3: 通过文本内容查找 "次へ"
      nextLink = $('a').filter((_, el) => $(el).text().trim() === '次へ');
    }

    if (nextLink.length > 0) {
      // 使用 prop('href') 获取完整的 URL（包括相对路径的解析）
      let href = nextLink.first().prop('href');
      if (!href) {
        href = nextLink.first().attr('href');
      }

      if (href) {
        // 从 href 中提取页码参数
        // 支持格式：?p=2 或 &p=2
        const pageMatch = href.toString().match(/[?&]p=(\d+)/);
        if (pageMatch && pageMatch[1]) {
          const nextPage = parseInt(pageMatch[1], 10);
          const currentPageMatch = currentUrl.match(/[?&]p=(\d+)/);
          const currentPage =
            currentPageMatch && currentPageMatch[1] ? parseInt(currentPageMatch[1], 10) : 1;

          // 如果下一页页码大于当前页，返回下一页 URL
          if (nextPage > currentPage) {
            // 构建完整 URL
            if (href.startsWith('http')) {
              return href.toString();
            } else if (href.startsWith('/')) {
              const baseUrlObj = new URL(currentUrl);
              return `${baseUrlObj.origin}${href}`;
            } else {
              const baseUrlObj = new URL(currentUrl);
              return new URL(href, baseUrlObj.href).href;
            }
          }
        } else {
          // 如果没有页码参数，但链接存在，可能是相对路径
          // 检查链接是否指向不同的页面
          if (href && !href.startsWith('#')) {
            // 构建完整 URL
            if (href.startsWith('http')) {
              return href.toString();
            } else if (href.startsWith('/')) {
              const baseUrlObj = new URL(currentUrl);
              return `${baseUrlObj.origin}${href}`;
            } else {
              const baseUrlObj = new URL(currentUrl);
              const fullUrl = new URL(href, baseUrlObj.href).href;
              // 如果 URL 不同，可能是下一页
              if (fullUrl !== currentUrl) {
                return fullUrl;
              }
            }
          }
        }
      }
    }

    // 如果上述方法都失败，回退到查找所有分页链接
    const allPagerLinks = $('.c-pager a, .novelview_pager a');

    const currentPageMatch = currentUrl.match(/[?&]p=(\d+)/);
    const currentPage =
      currentPageMatch && currentPageMatch[1] ? parseInt(currentPageMatch[1], 10) : 1;

    let nextPageUrl: string | null = null;
    let minNextPage = Infinity;

    allPagerLinks.each((_, el) => {
      const $link = $(el);
      const href = $link.prop('href') || $link.attr('href');
      if (href) {
        const pageMatch = href.toString().match(/[?&]p=(\d+)/);
        if (pageMatch && pageMatch[1]) {
          const page = parseInt(pageMatch[1], 10);
          if (page > currentPage && page < minNextPage) {
            minNextPage = page;
            // 构建完整 URL
            if (href.startsWith('http')) {
              nextPageUrl = href.toString();
            } else if (href.startsWith('/')) {
              const baseUrlObj = new URL(currentUrl);
              nextPageUrl = `${baseUrlObj.origin}${href}`;
            } else {
              const baseUrlObj = new URL(currentUrl);
              nextPageUrl = new URL(href, baseUrlObj.href).href;
            }
          }
        }
      }
    });

    return nextPageUrl;
  }

  /**
   * 解析单页小说页面 HTML
   * @param html HTML 内容
   * @param baseUrl 基础 URL（用于构建完整链接）
   * @returns 解析后的章节和卷信息
   */
  protected parseNovelPageSingle(
    html: string,
    baseUrl: string,
  ): {
    chapters: ParsedChapterInfo[];
    volumes: Array<{ title: string; startIndex: number }>;
  } {
    const $ = cheerio.load(html);

    // 提取章节列表和卷信息
    const chapters: ParsedChapterInfo[] = [];
    const volumeInfo: Array<{ title: string; startIndex: number }> = [];

    // 查找章节列表容器
    const indexBox = $('.index_box');

    if (indexBox.length > 0) {
      let currentVolumeTitle: string | null = null;
      let currentVolumeStartIndex = 0;
      let chapterIndex = 0;

      // 使用与 novel-downloader 相同的方式查找元素
      // 查找：直接子元素中的 .chapter_title 和所有 .novel_sublist2（可能是嵌套的）
      const table = indexBox.find('> .chapter_title, .novel_sublist2');

      table.each((_, element) => {
        const $el = $(element);

        // 检查是否是卷标题
        if ($el.hasClass('chapter_title')) {
          const volumeTitle = $el.text().trim();
          if (volumeTitle) {
            // 保存当前卷的信息（如果有的话）
            if (currentVolumeTitle !== null) {
              volumeInfo.push({
                title: currentVolumeTitle,
                startIndex: currentVolumeStartIndex,
              });
            }
            // 设置新的当前卷标题和起始索引
            currentVolumeTitle = volumeTitle;
            currentVolumeStartIndex = chapterIndex;
          }
        }
        // 检查是否是章节列表项
        else if ($el.hasClass('novel_sublist2')) {
          // 检查是否有 .bookmarker_now，如果有则跳过（这是当前阅读位置的标记）
          if ($el.find('.bookmarker_now').length > 0) {
            return; // 跳过这个元素
          }

          // 尝试多种方式查找章节链接
          let link = $el.find('.subtitle a').first();
          if (link.length === 0) {
            // 如果没有找到 .subtitle a，尝试直接查找 a 标签
            link = $el.find('a').first();
          }

          if (link.length > 0) {
            // 使用 prop('href') 获取完整的 URL（包括相对路径的解析）
            // 如果 prop 返回 undefined，则使用 attr
            let href = link.prop('href');
            if (!href) {
              href = link.attr('href');
            }

            // 如果没有 href 属性，尝试从 data 属性或其他方式获取
            if (!href) {
              return; // 跳过没有链接的项
            }

            // 获取章节标题
            let chapterTitle = link.text().trim();
            // 如果链接中没有文本，尝试从父元素获取
            if (!chapterTitle) {
              chapterTitle = $el.find('.subtitle').text().trim();
            }
            if (!chapterTitle) {
              chapterTitle = $el.text().trim();
            }

            if (href && chapterTitle) {
              // 构建完整 URL
              let fullUrl: string;
              if (href.startsWith('http')) {
                fullUrl = href;
              } else if (href.startsWith('/')) {
                // 使用当前实例的 BASE_URL（可能是 ncode 或 novel18）
                const baseUrlObj = new URL(baseUrl);
                fullUrl = `${baseUrlObj.origin}${href}`;
              } else {
                // 相对路径，需要基于 baseUrl 解析
                const baseUrlObj = new URL(baseUrl);
                fullUrl = new URL(href, baseUrlObj.href).href;
              }

              // 验证 URL 是否包含章节 ID（数字）
              // ncode.syosetu.com 的章节 URL 格式：/{novel_id}/{chapter_id}
              const novelId = this.extractNovelId(baseUrl);
              if (novelId) {
                // 检查 URL 是否包含有效的章节 ID
                const chapterIdMatch = fullUrl.match(new RegExp(`/${novelId}/(\\d+)`));
                if (!chapterIdMatch) {
                  // 如果 URL 不包含章节 ID，跳过这个章节
                  return;
                }
              }

              // 提取日期
              // ncode.syosetu.com 的日期格式：YYYY/MM/DD HH:mm
              let date: string | Date | undefined;
              let lastUpdated: string | Date | undefined;
              const dateElement = $el.find('.long_update');
              if (dateElement.length > 0) {
                // 尝试从 title 属性中获取日期（格式：YYYY/MM/DD HH:mm）
                const dateTitle = dateElement.find('span[title*="/"]').attr('title');
                if (dateTitle) {
                  const cleanedDate = dateTitle.replace(/改稿|^\s+|\s+$/g, '').trim();
                  // 解析日期字符串为 Date 对象
                  const parsedDate = this.parseDateString(cleanedDate);
                  // 检查是否包含 "改稿" 标记
                  if (dateTitle.includes('改稿')) {
                    lastUpdated = parsedDate || cleanedDate;
                  } else {
                    date = parsedDate || cleanedDate;
                    lastUpdated = parsedDate || cleanedDate; // 导入时，所有从网站获取的日期都作为 lastUpdated
                  }
                } else {
                  // 如果没有 title 属性，从文本中提取
                  dateElement.find('*').remove();
                  const dateText = dateElement.text().trim();
                  if (dateText && dateText.match(/\d{4}\/\d{1,2}\/\d{1,2}/)) {
                    const parsedDate = this.parseDateString(dateText);
                    date = parsedDate || dateText;
                    lastUpdated = parsedDate || dateText;
                  }
                }
              }

              const chapter: ParsedChapterInfo = {
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

      // 如果没有卷信息但有关节，创建一个默认卷
      if (volumeInfo.length === 0 && chapters.length > 0) {
        volumeInfo.push({
          title: '正文',
          startIndex: 0,
        });
      }
    }

    // 如果没有找到章节，尝试备用方法：从所有链接中查找章节
    if (chapters.length === 0) {
      const novelId = this.extractNovelId(baseUrl);
      if (novelId) {
        // 查找所有包含 novel_id 和数字的链接
        $(`a[href*="${novelId}"]`).each((_, el) => {
          const link = $(el);
          const href = link.prop('href') || link.attr('href');
          const text = link.text().trim();

          if (href && text) {
            // 检查是否是章节链接（包含 novel_id 和数字，但不包含 index 或 novelview）
            if (
              href.includes(novelId) &&
              /\d+/.test(href) &&
              !href.includes('index') &&
              !href.includes('novelview') &&
              !href.includes('novelview/infotop')
            ) {
              // 构建完整 URL
              let fullUrl: string;
              if (href.startsWith('http')) {
                fullUrl = href;
              } else if (href.startsWith('/')) {
                const baseUrlObj = new URL(baseUrl);
                fullUrl = `${baseUrlObj.origin}${href}`;
              } else {
                const baseUrlObj = new URL(baseUrl);
                fullUrl = new URL(href, baseUrlObj.href).href;
              }

              // 验证 URL 格式
              if (fullUrl.match(new RegExp(`/${novelId}/\\d+`))) {
                chapters.push({
                  title: text,
                  url: fullUrl,
                });
              }
            }
          }
        });
      }
    }

    return { chapters, volumes: volumeInfo };
  }

  /**
   * 解析小说页面 HTML（包含基本信息）
   * @param html HTML 内容
   * @param baseUrl 基础 URL（用于构建完整链接）
   * @returns 解析后的小说基本信息
   */
  protected parseNovelPage(
    html: string,
    _baseUrl: string,
  ): {
    title: string;
    author?: string;
    description?: string;
    tags?: string[];
  } {
    const $ = cheerio.load(html);

    // 提取标题
    let title = $('#novel_title').text().trim();
    if (!title) {
      title = $('h1').first().text().trim();
    }
    if (!title) {
      title = $('title').first().text().trim();
    }
    if (!title) {
      title = '未知标题';
    }

    // 提取作者
    let author: string | undefined = $('#novel_writername').text().trim();
    if (!author) {
      author = $('a[href*="/user/"]').first().text().trim();
    }
    if (!author) {
      author = undefined;
    }

    // 提取描述
    let description: string | undefined = $('#novel_ex').text().trim();
    if (!description) {
      description = $('meta[name="description"]').attr('content')?.trim();
    }

    // 提取标签
    const tags: string[] = [];
    $('.novel_tag, [class*="tag"]').each((_, el) => {
      const tagText = $(el).text().trim();
      if (tagText) {
        tags.push(tagText);
      }
    });

    const result: {
      title: string;
      author?: string;
      description?: string;
      tags?: string[];
    } = {
      title,
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
    return result;
  }

  /**
   * 获取页面并返回状态码（用于检查 404）
   * @param url 页面 URL
   * @returns Promise<{ html: string; statusCode: number | null }> HTML 内容和状态码
   */
  protected async fetchPageWithStatus(
    url: string,
  ): Promise<{ html: string; statusCode: number | null }> {
    try {
      const html = await this.fetchPage(url);
      return { html, statusCode: 200 };
    } catch {
      // 如果使用 AllOrigins 代理，尝试从响应中提取状态码
      if (this.useProxy) {
        try {
          const axios = (await import('axios')).default;
          const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
          const response = await axios.get<{
            contents: string;
            status: {
              http_code: number;
              content_type: string;
              url: string;
            };
          }>(allOriginsUrl, {
            timeout: 60000,
            validateStatus: () => true, // 接受所有状态码
          });

          // 检查 AllOrigins 返回的状态码
          if (response.data.status.http_code === 404) {
            return { html: '', statusCode: 404 };
          }
          // 如果状态码是 200，返回内容
          if (response.data.status.http_code === 200 && response.data.contents) {
            return { html: response.data.contents, statusCode: 200 };
          }
          // 其他状态码
          return { html: '', statusCode: response.data.status.http_code };
        } catch {
          // 忽略错误
        }
      } else {
        // 不使用 AllOrigins 代理时，尝试直接请求以获取状态码
        // 在浏览器环境中，使用 Vite 代理路径
        try {
          const axios = (await import('axios')).default;
          const isBrowser = typeof window !== 'undefined';
          let finalUrl = url;

          // 在浏览器环境中，使用 Vite 代理路径
          if (isBrowser) {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'ncode.syosetu.com') {
              finalUrl = `/api/ncode${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
            } else if (urlObj.hostname === 'novel18.syosetu.com') {
              finalUrl = `/api/novel18${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
            }
          }

          const headers: Record<string, string> = {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          };

          if (!isBrowser) {
            headers['User-Agent'] =
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            headers['Accept-Encoding'] = 'gzip, deflate, br';
            headers['Referer'] = url.startsWith('https://')
              ? new URL(url).origin
              : 'https://ncode.syosetu.com/';
          }

          const response = await axios.get(finalUrl, {
            timeout: 30000,
            headers,
            validateStatus: () => true, // 接受所有状态码
          });

          if (response.status === 404) {
            return { html: '', statusCode: 404 };
          }
          if (response.status === 200 && response.data) {
            return { html: response.data, statusCode: 200 };
          }
          return { html: '', statusCode: response.status };
        } catch {
          // 忽略错误
        }
      }

      // 如果无法获取状态码，返回 null
      return { html: '', statusCode: null };
    }
  }

  /**
   * 解析小说页面（支持分页获取所有章节）
   * @param baseUrl 小说主页 URL
   * @returns 解析后的小说信息（包含所有页面的章节）
   */
  protected async parseNovelPageWithPagination(baseUrl: string): Promise<{
    title: string;
    author?: string;
    description?: string;
    tags?: string[];
    chapters: ParsedChapterInfo[];
    volumes?: ParsedVolumeInfo[];
    webUrl: string;
  }> {
    // 获取第一页
    const firstPageResult = await this.fetchPageWithStatus(baseUrl);
    if (firstPageResult.statusCode === 404) {
      throw new Error('小说页面不存在 (404)');
    }
    const firstPageHtml = firstPageResult.html;
    const basicInfo = this.parseNovelPage(firstPageHtml, baseUrl);
    const firstPageData = this.parseNovelPageSingle(firstPageHtml, baseUrl);

    // 合并所有页面的章节和卷信息
    const allChapters: ParsedChapterInfo[] = [...firstPageData.chapters];
    const allVolumes: Array<{ title: string; startIndex: number }> = [...firstPageData.volumes];
    let currentChapterIndex = firstPageData.chapters.length;

    // 获取下一页并继续解析
    let currentUrl = baseUrl;
    let _currentPage = 1;
    const visitedUrls = new Set<string>([this.normalizeUrl(baseUrl)]); // 跟踪已访问的 URL，避免重复
    let nextPageUrl: string | null = this.getNextPageUrl(firstPageHtml, currentUrl);

    // 规范化 nextPageUrl
    if (nextPageUrl) {
      nextPageUrl = this.normalizeUrl(nextPageUrl);
    }

    // 如果第一页没有找到下一页链接，尝试手动构建第二页 URL
    if (!nextPageUrl) {
      // 尝试构建第二页 URL（添加 ?p=2 参数）
      const baseUrlObj = new URL(baseUrl);
      baseUrlObj.searchParams.set('p', '2');
      const secondPageUrl = this.normalizeUrl(baseUrlObj.toString());

      // 检查是否已访问过
      if (!visitedUrls.has(secondPageUrl)) {
        // 尝试获取第二页，如果成功则说明有分页
        const secondPageResult = await this.fetchPageWithStatus(secondPageUrl);
        if (secondPageResult.statusCode === 404) {
          // 404 错误，说明没有更多页面了，nextPageUrl 保持为 null，不会进入循环
        } else if (secondPageResult.statusCode === 200) {
          const testData = this.parseNovelPageSingle(secondPageResult.html, secondPageUrl);
          if (testData.chapters.length > 0) {
            // 存在第二页，直接合并数据
            if (testData.volumes.length > 0) {
              const updatedVolumes = testData.volumes.map((volume) => ({
                title: volume.title,
                startIndex: volume.startIndex + currentChapterIndex,
              }));
              allVolumes.push(...updatedVolumes);
            }
            allChapters.push(...testData.chapters);
            currentChapterIndex += testData.chapters.length;

            // 标记为已访问并更新页码
            visitedUrls.add(secondPageUrl);
            _currentPage = 2;
            currentUrl = secondPageUrl;

            // 准备下一页（第三页）的 URL，供循环使用
            // 先尝试从第二页 HTML 中解析下一页链接
            const nextLinkFromPage2 = this.getNextPageUrl(secondPageResult.html, secondPageUrl);
            if (nextLinkFromPage2) {
              nextPageUrl = this.normalizeUrl(nextLinkFromPage2);
            } else {
              // 如果没解析到，手动构建第三页 URL
              const page3UrlObj = new URL(baseUrl);
              page3UrlObj.searchParams.set('p', '3');
              nextPageUrl = this.normalizeUrl(page3UrlObj.toString());
            }
          }
        }
      }
    } else {
      // 如果找到了下一页链接，检查是否已访问过
      if (visitedUrls.has(nextPageUrl)) {
        nextPageUrl = null; // 避免重复访问
      }
    }

    while (nextPageUrl) {
      // 检查是否已访问过（防止重复）
      if (visitedUrls.has(nextPageUrl)) {
        break;
      }
      visitedUrls.add(nextPageUrl);

      // 更新当前页码（从 URL 中解析）
      const pageMatch = nextPageUrl.match(/[?&]p=(\d+)/);
      if (pageMatch && pageMatch[1]) {
        _currentPage = parseInt(pageMatch[1], 10);
      }

      // 获取下一页并检查状态码
      const nextPageResult = await this.fetchPageWithStatus(nextPageUrl);

      // 如果返回 404，说明没有更多页面了
      if (nextPageResult.statusCode === 404) {
        break;
      }

      // 如果状态码不是 200，跳过这一页
      if (nextPageResult.statusCode !== 200) {
        break;
      }

      const nextPageHtml = nextPageResult.html;
      const nextPageData = this.parseNovelPageSingle(nextPageHtml, nextPageUrl);

      // 如果这一页没有章节，说明已经到最后一页了
      if (nextPageData.chapters.length === 0) {
        break;
      }

      // 合并章节（需要更新卷的起始索引）
      if (nextPageData.volumes.length > 0) {
        // 更新卷的起始索引（基于当前章节总数）
        const updatedVolumes = nextPageData.volumes.map((volume) => ({
          title: volume.title,
          startIndex: volume.startIndex + currentChapterIndex,
        }));
        allVolumes.push(...updatedVolumes);
      }

      allChapters.push(...nextPageData.chapters);
      currentChapterIndex += nextPageData.chapters.length;

      // 检查是否还有下一页
      currentUrl = nextPageUrl;
      const extractedNextLink = this.getNextPageUrl(nextPageHtml, currentUrl);

      nextPageUrl = extractedNextLink;

      // 规范化 nextPageUrl
      if (nextPageUrl) {
        nextPageUrl = this.normalizeUrl(nextPageUrl);
      }

      // 如果 getNextPageUrl 没有找到下一页链接，说明已经到最后一页了
      if (!nextPageUrl) {
        break;
      } else {
        // 如果找到了下一页链接，检查是否已访问过
        if (visitedUrls.has(nextPageUrl)) {
          nextPageUrl = null; // 避免重复访问
        }
      }
    }

    // 构建结果
    const result: {
      title: string;
      author?: string;
      description?: string;
      tags?: string[];
      chapters: ParsedChapterInfo[];
      volumes?: ParsedVolumeInfo[];
      webUrl: string;
    } = {
      title: basicInfo.title,
      chapters: allChapters,
      webUrl: baseUrl,
    };

    if (basicInfo.author) {
      result.author = basicInfo.author;
    }

    if (basicInfo.description) {
      result.description = basicInfo.description;
    }

    if (basicInfo.tags) {
      result.tags = basicInfo.tags;
    }

    // 如果有卷信息，添加到结果中
    if (allVolumes.length > 0) {
      result.volumes = allVolumes.map((volume) => ({
        title: volume.title,
        startIndex: volume.startIndex,
      }));
    }

    return result;
  }

  /**
   * 解析日期字符串为 Date 对象
   * 支持格式：YYYY/MM/DD HH:mm
   * @param dateString 日期字符串
   * @returns Date 对象，如果解析失败则返回 undefined
   */
  protected parseDateString(dateString: string): Date | undefined {
    // 格式：YYYY/MM/DD HH:mm
    const match = dateString.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
    if (match && match[1] && match[2] && match[3]) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // JavaScript 月份从 0 开始
      const day = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const minute = match[5] ? parseInt(match[5], 10) : 0;
      return new Date(year, month, day, hour, minute);
    }
    return undefined;
  }

  /**
   * 创建章节对象（覆盖基类方法以支持 ncode.syosetu.com 的日期格式）
   * @param chapterInfo 解析后的章节信息
   * @param idGenerator 章节 ID 生成器
   * @param defaultDate 默认日期（如果章节信息中没有日期）
   * @returns Chapter 对象
   */
  protected override createChapter(
    chapterInfo: ParsedChapterInfo,
    idGenerator: UniqueIdGenerator,
    defaultDate: Date = new Date(),
  ): Chapter {
    // 解析创建日期
    let chapterDate = defaultDate;
    if (chapterInfo.date) {
      if (chapterInfo.date instanceof Date) {
        chapterDate = chapterInfo.date;
      } else {
        // 尝试解析 ncode.syosetu.com 的日期格式：YYYY/MM/DD HH:mm
        const parsedDate = this.parseDateString(chapterInfo.date);
        if (parsedDate) {
          chapterDate = parsedDate;
        }
      }
    }

    // 解析最后更新时间
    let lastUpdatedDate: Date | undefined;
    if (chapterInfo.lastUpdated) {
      if (chapterInfo.lastUpdated instanceof Date) {
        lastUpdatedDate = chapterInfo.lastUpdated;
      } else {
        // 尝试解析 ncode.syosetu.com 的日期格式：YYYY/MM/DD HH:mm
        const parsedDate = this.parseDateString(chapterInfo.lastUpdated);
        if (parsedDate) {
          lastUpdatedDate = parsedDate;
        }
      }
    }

    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    const chapter: Chapter = {
      id: idGenerator.generate(),
      title: {
        original: chapterInfo.title,
        translation,
      },
      webUrl: chapterInfo.url,
      lastEdited: chapterDate,
      createdAt: chapterDate,
    };

    // 只有当网站明确提供了 lastUpdated 时才设置
    if (lastUpdatedDate) {
      chapter.lastUpdated = lastUpdatedDate;
    }

    return chapter;
  }

  /**
   * 将 ncode.syosetu.com 小说信息转换为 Novel 格式
   * @param info 解析后的小说信息
   * @returns Novel 对象
   */
  protected convertToNovel(info: {
    title: string;
    author?: string;
    description?: string;
    tags?: string[];
    chapters: ParsedChapterInfo[];
    volumes?: ParsedVolumeInfo[];
    webUrl: string;
  }): Novel {
    const now = new Date();

    // 将 ParsedChapterInfo 转换为章节
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

    // 将 ParsedVolumeInfo 转换为卷信息
    const parsedVolumes: ParsedVolumeInfo[] | undefined = info.volumes?.map((volume) => ({
      title: volume.title,
      startIndex: volume.startIndex,
    }));

    // 使用基类的通用方法将章节分组到卷中
    const volumes = this.groupChaptersIntoVolumes(parsedChapters, parsedVolumes, '正文');

    // Novel 的 ID 使用完整的 uuidv4（不在短 ID 范围内）
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
