import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import type { Novel } from 'src/models/novel';
import type {
  FetchNovelResult,
  ParsedChapterInfo,
  ParsedVolumeInfo,
} from 'src/services/scraper/types';
import { BaseScraper } from '../core';

/**
 * Kakuyomu Apollo State 数据结构
 */
interface ApolloState {
  [key: string]: any;
}

interface KakuyomuWorkData {
  title: string;
  introduction: string;
  catchphrase?: string; // catchphrase 可能也在 workData 中
  tagLabels: string[];
  genre: string;
  tableOfContents: Array<{ __ref: string }>;
  ogImageUrl?: string;
  lastEpisodePublishedAt?: string;
  alternateTitle?: string;
}

interface KakuyomuTocItem {
  chapter?: { __ref: string };
  episodeUnions?: Array<{ __ref: string }>;
}

interface KakuyomuChapter {
  title: string;
  level: number;
}

interface KakuyomuEpisode {
  id: string;
  title: string;
  publishedAt: string;
}

interface ParsedNovelInfo {
  title: string;
  author?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  cover?: string | undefined;
  chapters: ParsedChapterInfo[];
  volumes?: ParsedVolumeInfo[] | undefined;
  webUrl: string;
}

/**
 * kakuyomu.jp 小说爬虫服务
 * 用于从 kakuyomu.jp 获取和解析小说信息
 *
 * Kakuyomu 使用 Next.js，所有数据都嵌入在页面的 __NEXT_DATA__ JSON 中
 */
export class KakuyomuScraper extends BaseScraper {
  protected override useProxy: boolean = false; // Kakuyomu 不使用代理，直接请求

  private static readonly BASE_URL = 'https://kakuyomu.jp';
  private static readonly NOVEL_URL_PATTERN = /^https?:\/\/kakuyomu\.jp\/works\/(\d+)(?:\/.*)?$/;

  /**
   * 验证 URL 是否为有效的 kakuyomu.jp 小说 URL
   */
  isValidUrl(url: string): boolean {
    return KakuyomuScraper.NOVEL_URL_PATTERN.test(url);
  }

  /**
   * 从 URL 中提取小说 ID
   */
  extractNovelId(url: string): string | null {
    const match = url.match(KakuyomuScraper.NOVEL_URL_PATTERN);
    return match?.[1] ?? null;
  }

  /**
   * 获取小说主页 URL
   */
  private getNovelIndexUrl(url: string): string {
    const novelId = this.extractNovelId(url);
    if (novelId) {
      return `${KakuyomuScraper.BASE_URL}/works/${novelId}`;
    }
    return url;
  }

  /**
   * 获取并解析小说信息
   */
  async fetchNovel(url: string): Promise<FetchNovelResult> {
    try {
      if (!this.isValidUrl(url)) {
        return this.createErrorResult('无效的 kakuyomu.jp 小说 URL');
      }

      const novelIndexUrl = this.getNovelIndexUrl(url);
      const html = await this.fetchPage(novelIndexUrl);

      // 调试：记录返回的 HTML 信息
      console.log('[KakuyomuScraper] fetchPage 返回', {
        url: novelIndexUrl,
        htmlLength: html.length,
        htmlPreview: html.substring(0, 500),
        hasNextData: html.includes('__NEXT_DATA__'),
      });

      // 解析页面中的 Next.js 数据
      const novelInfo = this.parseNovelPage(html, novelIndexUrl);
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
   */
  async fetchChapterContent(chapterUrl: string): Promise<string> {
    const html = await this.fetchPage(chapterUrl);
    const paragraphs = this.extractParagraphsFromHtml(html);
    return this.mergeParagraphs(paragraphs);
  }

  /**
   * 从 HTML 中提取段落
   * 保留原始格式，包括换行和段落结构
   */
  protected extractParagraphsFromHtml(html: string): string[] {
    const $ = cheerio.load(html);
    const paragraphs: string[] = [];

    // Kakuyomu 的章节内容在 .widget-episodeBody 中
    let contentElement = $('.widget-episodeBody').first();

    // 如果找不到，尝试其他可能的选择器
    if (contentElement.length === 0) {
      contentElement = $('[class*="widget-episodeBody"]').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('.episodeBody').first();
    }
    if (contentElement.length === 0) {
      contentElement = $('[class*="episodeBody"]').first();
    }

    if (contentElement.length === 0) {
      throw new Error('无法找到章节正文内容');
    }

    // 移除导航链接等不需要的元素
    contentElement.find('a[href*="episodes"]').each((_, linkEl) => {
      const $link = $(linkEl);
      const linkText = $link.text().trim();
      // 移除导航链接（如"前の話"、"次の話"等）
      if (/前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(linkText)) {
        $link.remove();
      }
    });

    // 递归提取段落文本，保留内部格式（如 <br> 换行）
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
            // 嵌套的 <p> 标签，递归提取但不自动添加换行
            // 只有 class="blank" 的 <p> 才会被处理为段落分隔
            const innerText = extractParagraphText($node);
            if (innerText.trim()) {
              text += innerText;
            }
          } else if (tagName === 'div') {
            // <div> 标签，递归提取内容
            const innerText = extractParagraphText($node);
            if (innerText.trim()) {
              text += innerText;
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

    // 提取所有段落 <p> 标签
    // 每个普通 <p> 标签作为新的一行（单换行）
    // 只有 class="blank" 的 <p> 才作为段落分隔（双换行）
    let currentParagraph = '';
    
    contentElement.find('p').each((_, el) => {
      const $p = $(el);
      const hasBlankClass = $p.hasClass('blank');
      const extractedText = extractParagraphText($p);
      const cleanedText = extractedText.trim();

      // 检查是否为导航文本
      if (/目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(cleanedText)) {
        return; // 跳过导航文本
      }

      if (hasBlankClass) {
        // <p class="blank"> 作为段落分隔，结束当前段落并开始新段落
        if (currentParagraph.trim()) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
      } else {
        // 普通 <p> 标签，每个都作为新的一行（单换行）
        if (cleanedText) {
          if (currentParagraph) {
            currentParagraph += '\n' + cleanedText;
          } else {
            currentParagraph = cleanedText;
          }
        }
      }
    });

    // 添加最后一个段落
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }

    // 如果没有找到 <p> 标签，尝试直接提取所有文本内容
    if (paragraphs.length === 0) {
      const allText = extractParagraphText(contentElement);
      const cleanedText = allText.trim();
      if (cleanedText && !/目\s*次|前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</.test(cleanedText)) {
        paragraphs.push(cleanedText);
      }
    }

    return paragraphs;
  }

  /**
   * 合并段落
   */
  private mergeParagraphs(paragraphs: string[]): string {
    return paragraphs.join('\n\n');
  }

  /**
   * 解析小说页面 HTML
   * Kakuyomu 使用 Next.js，数据嵌入在 <script id="__NEXT_DATA__"> 中
   */
  private parseNovelPage(html: string, baseUrl: string): ParsedNovelInfo {
    const $ = cheerio.load(html);

    // 提取 Next.js 数据 - 尝试多种方式查找
    let nextDataScript = $('script#__NEXT_DATA__').html();

    // 如果找不到，尝试其他可能的选择器
    if (!nextDataScript) {
      // 尝试查找所有包含 __NEXT_DATA__ 的 script 标签
      $('script').each((_, el) => {
        const scriptContent = $(el).html() || '';
        if (scriptContent.includes('__NEXT_DATA__') || scriptContent.includes('__APOLLO_STATE__')) {
          // 尝试提取 JSON 部分
          const jsonMatch = scriptContent.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?})(?:\s*;|$)/);
          if (jsonMatch && jsonMatch[1]) {
            nextDataScript = jsonMatch[1];
          } else if (scriptContent.trim().startsWith('{')) {
            // 如果整个脚本就是 JSON
            nextDataScript = scriptContent;
          }
        }
      });
    }

    // 如果还是找不到，尝试从页面中提取 JSON
    if (!nextDataScript) {
      const bodyText = $('body').html() || '';
      const jsonMatch = bodyText.match(
        /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
      );
      if (jsonMatch && jsonMatch[1]) {
        nextDataScript = jsonMatch[1];
      }
    }

    if (!nextDataScript) {
      // 提供更详细的错误信息用于调试
      const htmlLength = html.length;
      const hasScriptTags = $('script').length;
      const title = $('title').text().trim();
      const bodyText = $('body').text().substring(0, 200);

      console.error('[KakuyomuScraper] 无法找到 __NEXT_DATA__', {
        baseUrl,
        htmlLength,
        hasScriptTags,
        title,
        bodyPreview: bodyText,
        scriptTags: $('script')
          .map((_, el) => ({
            id: $(el).attr('id'),
            src: $(el).attr('src'),
            type: $(el).attr('type'),
            contentLength: ($(el).html() || '').length,
          }))
          .get()
          .slice(0, 5),
      });

      throw new Error(
        `无法找到 Kakuyomu 数据（__NEXT_DATA__ 不存在）。页面可能未完全加载或结构已改变。HTML 长度: ${htmlLength}，脚本标签数: ${hasScriptTags}`,
      );
    }

    let pageData;
    try {
      pageData = JSON.parse(nextDataScript);
    } catch {
      throw new Error('解析 Kakuyomu 数据失败');
    }

    // 提取 Apollo State（包含所有数据）

    const apolloState: ApolloState = pageData.props?.pageProps?.__APOLLO_STATE__;
    if (!apolloState) {
      throw new Error('无法找到 Apollo State 数据');
    }

    // 提取小说 ID
    const novelId = pageData.query?.workId;
    if (!novelId) {
      throw new Error('无法找到小说 ID');
    }

    // 获取作品数据
    const workData: KakuyomuWorkData = apolloState[`Work:${novelId}`];
    if (!workData) {
      throw new Error('无法找到作品数据');
    }

    // 解析卷和章节结构
    const { volumes, chapters } = this.parseTableOfContents(
      workData.tableOfContents,
      apolloState,
      novelId,
    );

    // 优先从 workData 获取完整描述（避免被截断）
    // workData.introduction 应该包含完整的描述，不会被"続きを読む"截断
    let description: string | undefined;
    
    // 优先使用 workData 中的 catchphrase 和 introduction
    const catchphrase = workData.catchphrase || this.extractCatchphrase($);
    const introduction = workData.introduction;
    
    if (introduction && introduction.trim().length > 0) {
      // 如果 introduction 存在，合并 catchphrase 和 introduction
      if (catchphrase) {
        description = `${catchphrase}\n\n${introduction}`;
      } else {
        description = introduction;
      }
    } else {
      // 如果 workData.introduction 不存在，回退到从 HTML 中提取
      description = this.extractDescription($);
    }

    return {
      title: workData.title || '未知标题',
      author: this.extractAuthor($),
      description,
      tags: [...(workData.tagLabels || []), workData.genre].filter(Boolean),
      cover: workData.ogImageUrl?.replace(/\?.+$/, ''),
      chapters,
      volumes,
      webUrl: baseUrl,
    };
  }

  /**
   * 从页面中提取作者名
   */
  private extractAuthor($: cheerio.CheerioAPI): string | undefined {
    const authorText = $('.partialGiftWidgetActivityName').first().text().trim();
    return authorText || undefined;
  }

  /**
   * 从页面中提取 catchphrase（第一行）
   */
  private extractCatchphrase($: cheerio.CheerioAPI): string | undefined {
    let catchphraseEl = $('.EyeCatch_catchphrase__tT_m2').first();
    if (catchphraseEl.length === 0) {
      catchphraseEl = $('[class*="EyeCatch_catchphrase"]').first();
    }
    if (catchphraseEl.length === 0) {
      catchphraseEl = $('[class*="EyeCatch_container"]').first();
    }
    const catchphrase = catchphraseEl.length > 0 ? catchphraseEl.text().trim() : '';
    return catchphrase || undefined;
  }

  /**
   * 从页面中提取描述（catchphrase + introduction）
   */
  private extractDescription($: cheerio.CheerioAPI): string | undefined {
    // 提取 catchphrase（第一行）- 使用更精确的选择器
    let catchphraseEl = $('.EyeCatch_catchphrase__tT_m2').first();
    if (catchphraseEl.length === 0) {
      catchphraseEl = $('[class*="EyeCatch_catchphrase"]').first();
    }
    if (catchphraseEl.length === 0) {
      catchphraseEl = $('[class*="EyeCatch_container"]').first();
    }
    const catchphrase = catchphraseEl.length > 0 ? catchphraseEl.text().trim() : '';

    // 提取 introduction（第二行）- 保留原始格式（包括换行）
    let introductionEl = $('.CollapseTextWithKakuyomuLinks_collapseText__XSlmz').first();
    if (introductionEl.length === 0) {
      introductionEl = $('[class*="CollapseTextWithKakuyomuLinks_collapseText"]').first();
    }

    // 提取 introduction 文本，保留换行符
    let introduction = '';
    if (introductionEl.length > 0) {
      // 使用递归方法提取完整的文本内容，处理 <br> 标签为换行
      const extractIntroductionText = (element: cheerio.Cheerio<any>): string => {
        let text = '';
        element.contents().each((_, node: any) => {
          const nodeType = String(node.type);
          if (nodeType === 'text') {
            // 文本节点，直接添加
            const nodeText = $(node).text();
            text += nodeText;
          } else if (nodeType === 'tag') {
            const $node = $(node);
            const tagName = node.tagName?.toLowerCase() || '';
            if (tagName === 'br') {
              // <br> 标签转换为换行
              text += '\n';
            } else if (tagName === 'p') {
              // 段落标签，递归提取并添加换行
              const innerText = extractIntroductionText($node);
              if (innerText.trim()) {
                text += innerText.trim() + '\n';
              } else {
                // 空段落也添加换行
                text += '\n';
              }
            } else {
              // 其他标签（如链接等），递归提取内容
              const innerText = extractIntroductionText($node);
              if (innerText) {
                text += innerText;
              }
            }
          }
        });
        return text;
      };
      
      introduction = extractIntroductionText(introductionEl).trim();

      // 清理多余的换行符（将多个连续换行符合并为双换行）
      introduction = introduction.replace(/\n{3,}/g, '\n\n');
    }

    // 合并两部分，使用双换行符分隔
    if (catchphrase && introduction) {
      // 确保有换行符分隔
      return `${catchphrase}\n\n${introduction}`;
    } else if (catchphrase) {
      return catchphrase;
    } else if (introduction) {
      return introduction;
    }

    return undefined;
  }

  /**
   * 解析目录结构（tableOfContents）
   */
  private parseTableOfContents(
    tableOfContents: Array<{ __ref: string }>,
    apolloState: ApolloState,
    novelId: string,
  ): { volumes?: ParsedVolumeInfo[]; chapters: ParsedChapterInfo[] } {
    const chapters: ParsedChapterInfo[] = [];
    const volumes: ParsedVolumeInfo[] = [];
    let currentVolumeStartIndex = 0;
    let currentVolumeTitle: string | null = null;

    tableOfContents.forEach((ref) => {
      const toc: KakuyomuTocItem = apolloState[ref.__ref];
      if (!toc) return;

      // 检查是否有章节标题（卷标题）
      if (toc.chapter?.__ref) {
        const chapterData: KakuyomuChapter = apolloState[toc.chapter.__ref];
        if (chapterData?.title) {
          // 保存上一卷的信息（如果有的话）
          if (currentVolumeTitle !== null && chapters.length > currentVolumeStartIndex) {
            volumes.push({
              title: currentVolumeTitle,
              startIndex: currentVolumeStartIndex,
            });
          }

          // 新卷开始
          currentVolumeTitle = chapterData.title;
          currentVolumeStartIndex = chapters.length;
        }
      }

      // 提取该节的所有章节
      if (toc.episodeUnions) {
        toc.episodeUnions.forEach((episodeRef) => {
          const episode: KakuyomuEpisode = apolloState[episodeRef.__ref];
          if (!episode) return;

          const chapterUrl = `${KakuyomuScraper.BASE_URL}/works/${novelId}/episodes/${episode.id}`;

          const chapterInfo: ParsedChapterInfo = {
            title: episode.title,
            url: chapterUrl,
          };

          if (episode.publishedAt) {
            const formattedDate = this.formatDate(episode.publishedAt);
            chapterInfo.date = formattedDate;
            chapterInfo.lastUpdated = formattedDate;
          }

          chapters.push(chapterInfo);
        });
      }
    });

    // 保存最后一卷的信息
    if (currentVolumeTitle !== null && chapters.length > currentVolumeStartIndex) {
      volumes.push({
        title: currentVolumeTitle,
        startIndex: currentVolumeStartIndex,
      });
    }

    const result: { volumes?: ParsedVolumeInfo[]; chapters: ParsedChapterInfo[] } = {
      chapters,
    };

    if (volumes.length > 0) {
      result.volumes = volumes;
    }

    return result;
  }

  /**
   * 格式化日期
   */
  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${year}年${month}月${day}日`;
    } catch {
      return dateString;
    }
  }

  /**
   * 转换为 Novel 格式
   */
  private convertToNovel(info: ParsedNovelInfo): Novel {
    const now = new Date();
    const parsedChapters: ParsedChapterInfo[] = info.chapters;
    const parsedVolumes: ParsedVolumeInfo[] | undefined = info.volumes;

    // 使用基类的通用方法将章节分组到卷中
    const volumes = this.groupChaptersIntoVolumes(parsedChapters, parsedVolumes, '正文');

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

    if (info.tags && info.tags.length > 0) {
      novel.tags = info.tags;
    }

    if (info.cover) {
      novel.cover = {
        url: info.cover,
      };
    }

    return novel;
  }
}
