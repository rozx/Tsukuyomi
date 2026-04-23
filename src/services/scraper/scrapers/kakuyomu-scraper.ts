import * as cheerio from 'cheerio';
import type { Novel } from 'src/models/novel';
import type {
  ParsedChapterInfo,
  ParsedNovelInfo,
  ParsedVolumeInfo,
} from 'src/services/scraper/types';
import { BaseScraper } from '../core';
import { visitCheerioContents } from '../core/cheerio-text-extract';

/**
 * Kakuyomu Apollo State 数据结构
 */
interface ApolloState {
  [key: string]: any;
}

interface KakuyomuWorkData {
  title: string;
  introduction?: string;
  catchphrase?: string;
  tagLabels?: string[];
  genre?: string;
  tableOfContents?: Array<{ __ref: string }>;
  tableOfContentsV2?: Array<{ __ref: string }>;
  ogImageUrl?: string;
  lastEpisodePublishedAt?: string;
  alternateTitle?: string;
  author?: { __ref: string };
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

/**
 * kakuyomu.jp 小说爬虫服务
 * 用于从 kakuyomu.jp 获取和解析小说信息
 *
 * Kakuyomu 使用 Next.js，所有数据都嵌入在页面的 __NEXT_DATA__ JSON 中
 */
export class KakuyomuScraper extends BaseScraper<ParsedNovelInfo> {
  protected override useProxy: boolean = false; // Kakuyomu 不使用代理，直接请求

  private static readonly BASE_URL = 'https://kakuyomu.jp';
  private static readonly NOVEL_URL_PATTERN = /^https?:\/\/kakuyomu\.jp\/works\/(\d+)(?:\/.*)?$/;

  /**
   * 验证 URL 是否为有效的 kakuyomu.jp 小说 URL
   */
  // fallow-ignore-next-line unused-class-member
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
  protected override getNovelIndexUrl(url: string): string {
    const novelId = this.extractNovelId(url);
    if (novelId) {
      return `${KakuyomuScraper.BASE_URL}/works/${novelId}`;
    }
    return url;
  }

  protected override getInvalidUrlError(): string {
    return '无效的 kakuyomu.jp 小说 URL';
  }

  /**
   * 从小说主页 URL 拉取 HTML 并解析嵌入的 Next.js 数据
   */
  protected override async parseNovelInfoFromUrl(novelIndexUrl: string): Promise<ParsedNovelInfo> {
    const html = await this.fetchPage(novelIndexUrl);

    // 调试：记录返回的 HTML 信息
    console.log('[KakuyomuScraper] fetchPage 返回', {
      url: novelIndexUrl,
      htmlLength: html.length,
      htmlPreview: html.substring(0, 500),
      hasNextData: html.includes('__NEXT_DATA__'),
    });

    // 解析页面中的 Next.js 数据
    return this.parseNovelPage(html, novelIndexUrl);
  }

  /**
   * 从 HTML 中提取段落
   * 保留原始格式，包括换行和段落结构
   */
  protected extractParagraphsFromHtml(html: string): string[] {
    const $ = cheerio.load(html);
    const paragraphs: string[] = [];

    // Kakuyomu 的章节内容在 .widget-episodeBody 中，按优先级回退
    const contentElement = this.selectContentElement($, [
      '.widget-episodeBody',
      '[class*="widget-episodeBody"]',
      '.episodeBody',
      '[class*="episodeBody"]',
    ]);

    if (!contentElement) {
      throw new Error('无法找到章节正文内容');
    }

    // 移除导航链接（如"前の話"、"次の話"等）
    this.removeNavigationLinks(
      $,
      contentElement,
      'a[href*="episodes"]',
      /前\s*の\s*話|次\s*の\s*話|前へ|次へ|>>|<</,
    );

    const extractText = (el: cheerio.Cheerio<any>) => this.extractTextFromElement($, el);

    // 提取所有段落 <p> 标签
    // 每个普通 <p> 标签作为新的一行（单换行）
    // 只有 class="blank" 的 <p> 才作为段落分隔（双换行）
    let currentParagraph = '';

    contentElement.find('p').each((_, el) => {
      const $p = $(el);
      const hasBlankClass = $p.hasClass('blank');
      const extractedText = extractText($p);
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
      const allText = extractText(contentElement);
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
  protected mergeParagraphs(paragraphs: string[]): string {
    return paragraphs.join('\n\n');
  }

  /**
   * 从 HTML 中查找 __NEXT_DATA__ 脚本内容,三级回退:
   * 1. script#__NEXT_DATA__
   * 2. 扫描所有 script 标签,匹配 __NEXT_DATA__ = {...} 或整段 JSON
   * 3. 对 body HTML 做正则匹配
   */
  private findNextDataScript($: cheerio.CheerioAPI): string | null {
    const direct = $('script#__NEXT_DATA__').html();
    if (direct) return direct;

    let found: string | null = null;
    $('script').each((_, el) => {
      if (found) return;
      const scriptContent = $(el).html() || '';
      if (
        !scriptContent.includes('__NEXT_DATA__') &&
        !scriptContent.includes('__APOLLO_STATE__')
      ) {
        return;
      }
      const jsonMatch = scriptContent.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?})(?:\s*;|$)/);
      if (jsonMatch && jsonMatch[1]) {
        found = jsonMatch[1];
      } else if (scriptContent.trim().startsWith('{')) {
        found = scriptContent;
      }
    });
    if (found) return found;

    const bodyText = $('body').html() || '';
    const bodyMatch = bodyText.match(
      /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    return bodyMatch && bodyMatch[1] ? bodyMatch[1] : null;
  }

  /**
   * __NEXT_DATA__ 缺失时抛带调试信息的错误
   */
  private throwMissingNextData($: cheerio.CheerioAPI, html: string, baseUrl: string): never {
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

  /**
   * 解析 __NEXT_DATA__ JSON,抽取 apolloState / novelId / workData 并校验必要字段。
   */
  private resolveKakuyomuWork(nextDataScript: string): {
    apolloState: ApolloState;
    novelId: string;
    workData: KakuyomuWorkData;
  } {
    let pageData;
    try {
      pageData = JSON.parse(nextDataScript);
    } catch {
      throw new Error('解析 Kakuyomu 数据失败');
    }

    const apolloState: ApolloState = pageData.props?.pageProps?.__APOLLO_STATE__;
    if (!apolloState) {
      throw new Error('无法找到 Apollo State 数据');
    }

    const novelId = pageData.query?.workId;
    if (!novelId) {
      throw new Error('无法找到小说 ID');
    }

    const workData: KakuyomuWorkData = apolloState[`Work:${novelId}`];
    if (!workData) {
      throw new Error('无法找到作品数据');
    }

    return { apolloState, novelId, workData };
  }

  /**
   * 合成描述文本:优先用 workData.introduction(完整,不会被"続きを読む"截断),
   * 缺失时回退到 HTML 提取。
   */
  private buildNovelDescription(
    workData: KakuyomuWorkData,
    $: cheerio.CheerioAPI,
  ): string | undefined {
    const introduction = workData.introduction;
    if (introduction && introduction.trim().length > 0) {
      const catchphrase = workData.catchphrase || this.extractCatchphrase($);
      return catchphrase ? `${catchphrase}\n\n${introduction}` : introduction;
    }
    return this.extractDescription($);
  }

  /**
   * 解析小说页面 HTML
   * Kakuyomu 使用 Next.js，数据嵌入在 <script id="__NEXT_DATA__"> 中
   */
  private parseNovelPage(html: string, baseUrl: string): ParsedNovelInfo {
    const $ = cheerio.load(html);

    const nextDataScript = this.findNextDataScript($);
    if (!nextDataScript) {
      this.throwMissingNextData($, html, baseUrl);
    }

    const { apolloState, novelId, workData } = this.resolveKakuyomuWork(nextDataScript);

    // 解析卷和章节结构（v2 优先，兼容旧版 tableOfContents）
    const toc = workData.tableOfContentsV2 ?? workData.tableOfContents ?? [];
    const { volumes, chapters } = this.parseTableOfContents(toc, apolloState, novelId);

    return {
      title: workData.title || '未知标题',
      author: this.extractAuthorFromApollo(workData, apolloState) || this.extractAuthor($),
      description: this.buildNovelDescription(workData, $),
      tags: [...(workData.tagLabels || []), workData.genre].filter((t): t is string => !!t),
      cover: workData.ogImageUrl?.replace(/\?.+$/, ''),
      chapters,
      volumes,
      webUrl: baseUrl,
    };
  }

  /**
   * 从 Apollo State 中提取作者名
   */
  private extractAuthorFromApollo(
    workData: KakuyomuWorkData,
    apolloState: ApolloState,
  ): string | undefined {
    const authorRef = workData.author?.__ref;
    if (!authorRef) return undefined;
    const authorData = apolloState[authorRef];
    return authorData?.activityName || authorData?.name || undefined;
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
    // 提取 catchphrase（第一行）- 复用 extractCatchphrase 的三级回退选择器
    const catchphrase = this.extractCatchphrase($) ?? '';

    // 提取 introduction（第二行）- 保留原始格式（包括换行）
    let introductionEl = $('.CollapseTextWithKakuyomuLinks_collapseText__XSlmz').first();
    if (introductionEl.length === 0) {
      introductionEl = $('[class*="CollapseTextWithKakuyomuLinks_collapseText"]').first();
    }

    // 提取 introduction 文本，保留换行符
    let introduction = '';
    if (introductionEl.length > 0) {
      introduction = this.extractTextFromElement($, introductionEl).trim();
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
   * 从 DOM 元素中递归提取纯文本，保留 <br> 换行，将 <ruby> 注音转为 漢字(かんじ) 格式
   */
  private extractTextFromElement($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
    return visitCheerioContents($, element, ({ $node, tagName, recurse }) => {
      // 跳过 <rp> 括号标签（由下方 ruby 处理统一添加）；
      // rt 在非 ruby 上下文中被单独遍历时也跳过（正常情况由 ruby 分支处理）
      if (tagName === 'rp' || tagName === 'rt') return '';
      if (tagName === 'br') return '\n';
      if (tagName === 'ruby') {
        // <ruby>漢字<rt>かんじ</rt></ruby> → 漢字(かんじ)
        const rt = $node.find('rt').first().text().trim();
        // 提取 ruby 内非 rt/rp 的文本作为原文
        const base = $node
          .contents()
          .filter((_, child: any) => {
            const tag = child.tagName?.toLowerCase();
            return tag !== 'rt' && tag !== 'rp';
          })
          .text()
          .trim();
        return rt ? `${base}(${rt})` : base;
      }
      const innerText = recurse();
      return innerText ? innerText : '';
    });
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

    if (!tableOfContents || tableOfContents.length === 0) {
      return { chapters };
    }

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
  protected override convertToNovel(info: ParsedNovelInfo): Novel {
    const parsedChapters: ParsedChapterInfo[] = info.chapters;
    const parsedVolumes: ParsedVolumeInfo[] | undefined = info.volumes;

    // 使用基类的通用方法将章节分组到卷中
    const volumes = this.groupChaptersIntoVolumes(parsedChapters, parsedVolumes, '正文');

    return this.buildNovel(info, volumes);
  }
}
