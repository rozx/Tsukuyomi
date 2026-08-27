import axios from 'axios';
import type * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import type {
  NovelScraper,
  FetchNovelResult,
  ParsedChapterInfo,
  ParsedNovelInfo,
  ParsedVolumeInfo,
} from 'src/services/scraper/types';
import type { Novel, Chapter, Volume, Translation } from 'src/models/novel';
import { UniqueIdGenerator, generateShortId } from 'src/utils/id-generator';
import { ProxyService } from 'src/services/proxy-service';
import { useElectron } from 'src/composables/useElectron';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioNode = cheerio.Cheerio<any>;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
const ACCEPT_LANGUAGE = 'ja,en-US;q=0.9,en;q=0.8';
const FETCH_TIMEOUT_MS = 60000;

/** 通过 Electron 的 net 模块获取页面 */
async function fetchViaElectron(
  proxiedUrl: string,
  originalUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  if (!window.electronAPI?.fetch) {
    throw new Error('Electron API 未正确加载，请检查 preload 脚本');
  }
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: ACCEPT_HTML,
    'Accept-Language': ACCEPT_LANGUAGE,
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: new URL(originalUrl).origin,
    ...extraHeaders,
  };
  const response = await window.electronAPI.fetch(proxiedUrl, {
    method: 'GET',
    headers,
    timeout: FETCH_TIMEOUT_MS,
  });
  if (response.status >= 400) {
    throw new Error(`目标网站返回错误: ${response.status}`);
  }
  if (response.data) return response.data;
  throw new Error('返回的内容为空');
}

/** axios 头部 content-type 的多种形态统一转为字符串 */
function normalizeContentType(
  raw: string | number | boolean | string[] | undefined | null,
): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'number' || raw === true) return String(raw);
  return '';
}

/** 响应是否疑似 JSON 包装的代理响应 */
function looksLikeJsonProxyResponse(contentType: string, dataStr: string): boolean {
  return contentType.includes('application/json') || dataStr.trim().startsWith('{');
}

/** 构建 axios 请求头；浏览器经外部代理时用 x-cors-headers 转发站点头 */
function buildAxiosHeaders(
  proxiedUrl: string,
  originalUrl: string,
  isBrowser: boolean,
  extraHeaders: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: ACCEPT_HTML,
    'Accept-Language': ACCEPT_LANGUAGE,
  };
  if (isBrowser) {
    const usesExternalProxy = proxiedUrl !== originalUrl && !proxiedUrl.startsWith('/api/');
    if (usesExternalProxy && Object.keys(extraHeaders).length > 0) {
      headers['x-cors-headers'] = JSON.stringify(extraHeaders);
    }
    return headers;
  }
  return {
    ...headers,
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: originalUrl.startsWith('https://')
      ? new URL(originalUrl).origin
      : 'https://kakuyomu.jp/',
    ...extraHeaders,
  };
}

/** 通过 axios 获取页面；浏览器与 Node 环境分别构建可发送的请求头 */
async function fetchViaAxios(
  proxiedUrl: string,
  originalUrl: string,
  isBrowser: boolean,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const headers = buildAxiosHeaders(proxiedUrl, originalUrl, isBrowser, extraHeaders);
  const response = await axios.get(proxiedUrl, {
    timeout: FETCH_TIMEOUT_MS, // 与代理服务器超时一致
    headers,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  if (response.status >= 400) {
    throw new Error(`目标网站返回错误: ${response.status}`);
  }
  if (!response.data) throw new Error('返回的内容为空');

  // 某些代理服务返回 JSON 包装，需要拆出实际 HTML
  const contentType = normalizeContentType(
    response.headers['content-type'] as string | number | boolean | string[] | undefined | null,
  );
  const dataStr = typeof response.data === 'string' ? response.data : String(response.data);
  if (looksLikeJsonProxyResponse(contentType, dataStr)) {
    const html = extractHtmlFromJsonProxyResponse(response.data, dataStr);
    if (html !== null) return html;
  }
  return response.data;
}

/**
 * 从 JSON 包装的代理响应中解析出 HTML。支持 contents/data 字段；若实际是 HTML
 * 被误识别为 JSON，也回退返回。无法识别时返回 null 以继续原样返回 data。
 */
function extractHtmlFromJsonProxyResponse(
  rawData: unknown,
  dataStr: string,
): string | null {
  try {
    const jsonData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    if (jsonData && typeof jsonData === 'object') {
      const obj = jsonData as { contents?: unknown; data?: unknown };
      // AllOrigins：内容在 contents
      if (typeof obj.contents === 'string') return obj.contents;
      // 其他代理：内容在 data
      if (typeof obj.data === 'string') return obj.data;
      // cors.lol 可能直接返回 HTML，却把 Content-Type 标为 JSON
      if (dataStr.includes('<html') || dataStr.includes('<!DOCTYPE')) return dataStr;
      console.error('[BaseScraper] JSON 响应中未找到 HTML 内容', {
        keys: Object.keys(obj),
        jsonPreview: JSON.stringify(obj).substring(0, 500),
      });
    }
  } catch {
    // 不是有效的 JSON，可能是 HTML 被误判为 JSON → 回到调用方返回原始 data
  }
  return null;
}

/** 将 axios 错误归一化为用户友好的 Error */
function normalizeFetchError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return new Error(
        `获取页面失败: ${error.response.status} ${error.response.statusText || error.message}`,
      );
    }
    if (error.request) return new Error('网络连接失败，请检查网络设置');
    return new Error(`请求配置错误: ${error.message}`);
  }
  return error instanceof Error ? error : new Error('获取页面时发生未知错误');
}

/**
 * 爬虫服务基类
 * 提供通用的错误处理和工具方法
 *
 * @template TNovelInfo 解析得到的小说信息类型，子类可以通过泛型参数指定站点特定的扩展字段
 */
export abstract class BaseScraper<TNovelInfo extends ParsedNovelInfo = ParsedNovelInfo>
  implements NovelScraper
{
  /**
   * 是否使用服务器代理路径（在浏览器环境中使用 /api/... 代理）
   * 注意：在 Node.js/Bun 环境下不再使用 AllOrigins，而是直接访问或使用服务器代理
   * 子类可以通过设置此属性来控制是否使用代理
   * @default true
   */
  protected useProxy: boolean = true;

  /**
   * 验证 URL 是否为该服务支持的 URL
   * @param url 要验证的 URL
   * @returns 是否为支持的 URL
   */
  abstract isValidUrl(url: string): boolean;

  /**
   * 获取并解析小说信息（模板方法）
   * 统一处理 URL 校验、错误包装和结果构造；站点特定的解析逻辑通过以下抽象方法扩展：
   * - {@link getInvalidUrlError}：无效 URL 时的错误消息
   * - {@link getNovelIndexUrl}：根据任意 URL 推导出小说主页 URL
   * - {@link parseNovelInfoFromUrl}：从小说主页 URL 拉取并解析得到站点特定的信息
   * - {@link convertToNovel}：将解析结果转换为统一的 Novel 模型
   * @param url 小说 URL
   * @returns Promise<FetchNovelResult> 获取结果
   */
  async fetchNovel(url: string): Promise<FetchNovelResult> {
    try {
      if (!this.isValidUrl(url)) {
        return this.createErrorResult(this.getInvalidUrlError());
      }

      const novelIndexUrl = this.getNovelIndexUrl(url);
      const novelInfo = await this.parseNovelInfoFromUrl(novelIndexUrl);
      const novel = this.convertToNovel(novelInfo);

      return this.createSuccessResult(novel);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error : new Error('获取小说信息时发生未知错误'),
      );
    }
  }

  /**
   * 当传入的 URL 不符合该站点的格式时返回的错误消息
   */
  protected abstract getInvalidUrlError(): string;

  /**
   * 从任意 URL（小说主页或章节 URL）推导出小说主页 URL
   * @param url 原始 URL
   * @returns 小说主页 URL
   */
  protected abstract getNovelIndexUrl(url: string): string;

  /**
   * 从小说主页 URL 拉取并解析站点特定的小说信息
   * @param novelIndexUrl 小说主页 URL
   * @returns 解析后的小说信息
   */
  protected abstract parseNovelInfoFromUrl(novelIndexUrl: string): Promise<TNovelInfo>;

  /**
   * 将解析结果转换为统一的 Novel 模型
   * @param info 解析后的小说信息
   * @returns Novel 对象
   */
  protected abstract convertToNovel(info: TNovelInfo): Novel;

  /**
   * 获取章节内容：默认实现 = 抓 HTML → extractParagraphsFromHtml → mergeParagraphs。
   * kakuyomu / syosetu / ncode-syosetu 三站的流程完全一致，仅段落提取规则不同（由子类覆盖 extractParagraphsFromHtml）。
   * 如有特殊需求可继续覆盖此方法。
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
   * 从 HTML 中提取段落（抽象方法，由子类实现）
   * @param html 章节 HTML 内容
   * @returns 段落数组，每个元素是一个段落文本
   */
  protected abstract extractParagraphsFromHtml(html: string): string[];

  /**
   * 将提取到的段落数组合并为最终章节内容文本（抽象方法，由子类实现）。
   * 各站点对空段落、换行的处理方式不同，因此保留为抽象。
   */
  protected abstract mergeParagraphs(paragraphs: string[]): string;

  /**
   * 站点特定的额外 HTTP 请求头（如 novel18.syosetu.com 的年龄验证 Cookie）
   * @param url 原始页面 URL
   */
  protected getFetchExtraHeaders(url: string): Record<string, string> {
    void url;
    return {};
  }

  /**
   * 是否跳过外部 CORS 代理（例如 novel18 需保留 Cookie 头）
   */
  protected shouldSkipExternalProxy(): boolean {
    return false;
  }

  /**
   * 获取页面 HTML（通用方法）
   * 在浏览器环境中，使用服务器提供的 /api/... 代理路径或用户配置的代理
   * 在 Electron 环境中，使用 Electron 的 net 模块直接请求或用户配置的代理
   * 在 Node.js/Bun 环境中，直接访问 URL 或使用用户配置的代理
   * @param url 页面 URL
   * @param _proxyPath 代理路径（可选，已弃用）
   * @returns Promise<string> HTML 内容
   * @throws {Error} 如果获取失败
   */
  protected async fetchPage(url: string, _proxyPath?: string): Promise<string> {
    try {
      const { isElectron, isBrowser } = useElectron();
      const extraHeaders = this.getFetchExtraHeaders(url);
      const skipExternalProxy = this.shouldSkipExternalProxy();
      return await ProxyService.executeWithAutoSwitch(
        url,
        (proxiedUrl: string) =>
          isElectron.value
            ? fetchViaElectron(proxiedUrl, url, extraHeaders)
            : fetchViaAxios(proxiedUrl, url, isBrowser.value, extraHeaders),
        {
          skipExternalProxy,
          skipInternalProxy: isElectron.value, // Electron 环境不使用内部代理路径
          maxRetries: 3,
        },
      );
    } catch (error) {
      throw normalizeFetchError(error);
    }
  }

  /**
   * 创建错误结果
   * @param error 错误信息
   * @returns FetchNovelResult
   */
  protected createErrorResult(error: string | Error): FetchNovelResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : error,
    };
  }

  /**
   * 创建成功结果
   * @param novel 小说对象
   * @returns FetchNovelResult
   */
  protected createSuccessResult(novel: Novel): FetchNovelResult {
    return {
      success: true,
      novel,
    };
  }

  /**
   * 解析可能为 string 或 Date 的日期值
   * 字符串会委托给 {@link parseDateString}，子类可覆盖该方法以支持站点特定格式
   * @param value 日期值（string / Date / undefined）
   * @returns Date 对象或 undefined（无法解析时）
   */
  protected parseChapterDate(value: string | Date | undefined): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    return this.parseDateString(value);
  }

  /**
   * 解析章节日期字符串
   * 默认支持日本格式：`2025年05月16日(金) 08:13` 或 `2025年05月16日(金) 08:13(改)`
   * 子类可以覆盖此方法以支持其他格式（例如 ncode.syosetu.com 的 `YYYY/MM/DD HH:mm`）
   * @param dateString 日期字符串
   * @returns Date 对象，如果解析失败则返回 undefined
   */
  protected parseDateString(dateString: string): Date | undefined {
    // 移除 "(改)" 标记后解析
    const cleaned = dateString.replace(/\(改\)/g, '').trim();
    const match = cleaned.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const ymd = this.parseYearMonthDay(match);
    if (!ymd) return undefined;
    return new Date(ymd.year, ymd.month, ymd.day);
  }

  /**
   * 从正则 match 结果的 1/2/3 捕获组提取 year/month/day
   * 月份自动转为 JavaScript 的 0-based 月份。解析失败返回 undefined。
   * 用于子类覆盖 {@link parseDateString} 时共享的年月日解析逻辑。
   * @param match 正则 match 结果（要求 1/2/3 号捕获组分别是 年/月/日）
   */
  protected parseYearMonthDay(
    match: RegExpMatchArray | null,
  ): { year: number; month: number; day: number } | undefined {
    if (!match || !match[1] || !match[2] || !match[3]) return undefined;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JavaScript 月份从 0 开始
    const day = parseInt(match[3], 10);
    return { year, month, day };
  }

  /**
   * 创建章节对象（通用方法）
   * @param chapterInfo 解析后的章节信息
   * @param idGenerator 章节 ID 生成器
   * @param defaultDate 默认日期（如果章节信息中没有日期）
   * @returns Chapter 对象
   */
  protected createChapter(
    chapterInfo: ParsedChapterInfo,
    idGenerator: UniqueIdGenerator,
    defaultDate: Date = new Date(),
  ): Chapter {
    // 解析创建日期（解析失败时回退到 defaultDate）
    const chapterDate = this.parseChapterDate(chapterInfo.date) ?? defaultDate;

    // 解析最后更新时间
    // 只有当网站明确提供了 lastUpdated 时才设置，否则保持为 undefined
    const lastUpdatedDate = this.parseChapterDate(chapterInfo.lastUpdated);

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
   * 创建卷对象（通用方法）
   * @param volumeInfo 解析后的卷信息
   * @param chapters 该卷的章节数组
   * @param idGenerator 卷 ID 生成器
   * @returns Volume 对象
   */
  protected createVolume(
    volumeInfo: ParsedVolumeInfo,
    chapters: Chapter[],
    idGenerator: UniqueIdGenerator,
  ): Volume {
    const translation: Translation = {
      id: generateShortId(),
      translation: '',
      aiModelId: '',
    };

    return {
      id: idGenerator.generate(),
      title: {
        original: volumeInfo.title,
        translation,
      },
      chapters,
    };
  }

  /**
   * 在多个 CSS 选择器中按顺序查找第一个非空匹配元素
   * 用于各站点 `extractParagraphsFromHtml` 中常见的选择器回退链。
   * @param $ Cheerio API
   * @param selectors 选择器列表（按优先级排序）
   * @returns 第一个非空匹配的 Cheerio 元素；全部未命中时返回 null
   */
  protected selectContentElement(
    $: cheerio.CheerioAPI,
    selectors: string[],
  ): CheerioNode | null {
    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        return el;
      }
    }
    return null;
  }

  /**
   * 从指定根元素下查找匹配 `linkSelector` 的 `<a>` 标签，
   * 若其文本匹配 `navRegex`（视为"上一话/下一话/目次"等导航链接），则从 DOM 中移除。
   * 各站点仅导航正则不同，共享遍历与 trim 逻辑。
   * @param $ Cheerio API
   * @param root 在该元素下查找链接
   * @param linkSelector 链接选择器（如 `'a[href*="episodes"]'`、`'a'`）
   * @param navRegex 匹配导航文本的正则（命中即删除）
   */
  protected removeNavigationLinks(
    $: cheerio.CheerioAPI,
    root: CheerioNode,
    linkSelector: string,
    navRegex: RegExp,
  ): void {
    root.find(linkSelector).each((_, linkEl) => {
      const $link = $(linkEl);
      const linkText = $link.text().trim();
      if (navRegex.test(linkText)) {
        $link.remove();
      }
    });
  }

  /**
   * 判断 `<p>` 段落是否视为空段落（换行）
   * syosetu.org / ncode.syosetu.com 都将 HTML 或纯文本仅含空白的 `<p>` 视为换行符。
   * @param $p 段落 Cheerio 元素
   * @returns 段落是否为空（应当输出 '\n'）
   */
  protected isEmptyParagraphElement($p: CheerioNode): boolean {
    const paragraphHtml = $p.html() || '';
    const paragraphText = $p.text() || '';
    const hasOnlyWhitespace = paragraphText.trim().length === 0;
    const htmlIsEmpty = paragraphHtml.trim().length === 0;
    return hasOnlyWhitespace || htmlIsEmpty;
  }

  /**
   * 构建章节信息对象并推入数组（通用方法）
   * 仅当 `date` / `lastUpdated` 有值时才写入对应字段，避免 `undefined` 占位。
   * 日期字段类型由调用方通过泛型 `D` 指定（ncode 使用 `string | Date`，syosetu 使用 `string`）。
   * @param chapters 目标章节数组（元素类型由调用方维护）
   * @param info 章节基本信息：标题 / URL / 可选日期
   */
  protected appendParsedChapter<
    D extends string | Date,
    T extends { title: string; url: string; date?: D | undefined; lastUpdated?: D | undefined },
  >(
    chapters: T[],
    info: { title: string; url: string; date?: D | undefined; lastUpdated?: D | undefined },
  ): void {
    const chapter: T = { title: info.title, url: info.url } as T;
    if (info.date !== undefined) {
      (chapter as { date?: D }).date = info.date;
    }
    if (info.lastUpdated !== undefined) {
      (chapter as { lastUpdated?: D }).lastUpdated = info.lastUpdated;
    }
    chapters.push(chapter);
  }

  /**
   * 基于 ParsedNovelInfo 构建统一的 Novel 对象（通用方法）
   *
   * 所有子类 `convertToNovel` 的公共骨架：
   * - 生成 uuidv4 作为 Novel ID（Novel 不使用短 ID）
   * - 填充 title / volumes / webUrl / lastEdited / createdAt
   * - 按需填充 author / description / tags / cover
   *
   * 各站点仅需负责把解析结果整理为 `ParsedNovelInfo` 并通过
   * {@link groupChaptersIntoVolumes} 生成 volumes 后调用此方法。
   *
   * @param info 解析后的小说信息
   * @param volumes 已经构建好的卷数组
   * @returns Novel 对象
   */
  /**
   * 将解析结果一步转换为 Novel：复制可选日期字段 → 按 ParsedVolumeInfo 分卷 → 调用 {@link buildNovel}。
   * syosetu.org / ncode.syosetu.com 的 convertToNovel 共用此实现（它们的 chapter/volume 类型结构兼容 Parsed*Info）。
   *
   * @param info 解析后的小说信息（需包含 chapters 数组，可选 volumes）
   * @param defaultVolumeTitle 当没有卷信息时的默认卷标题
   */
  protected buildNovelFromParsedInfo(
    info: ParsedNovelInfo & {
      chapters: readonly ParsedChapterInfo[];
      volumes?: readonly ParsedVolumeInfo[] | undefined;
    },
    defaultVolumeTitle: string = '正文',
  ): Novel {
    const parsedChapters: ParsedChapterInfo[] = info.chapters.map((chapter) => {
      const parsed: ParsedChapterInfo = { title: chapter.title, url: chapter.url };
      if (chapter.date) parsed.date = chapter.date;
      if (chapter.lastUpdated) parsed.lastUpdated = chapter.lastUpdated;
      return parsed;
    });

    const parsedVolumes: ParsedVolumeInfo[] | undefined = info.volumes?.map((volume) => ({
      title: volume.title,
      startIndex: volume.startIndex,
    }));

    const volumes = this.groupChaptersIntoVolumes(parsedChapters, parsedVolumes, defaultVolumeTitle);
    return this.buildNovel(info, volumes);
  }

  protected buildNovel(info: ParsedNovelInfo, volumes: Volume[]): Novel {
    const now = new Date();
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

  /**
   * 将章节分组到卷中（通用方法）
   * @param chapters 章节数组
   * @param volumesInfo 卷信息数组（可选）
   * @param defaultVolumeTitle 默认卷标题（当没有卷信息时使用）
   * @returns Volume 数组
   */
  protected groupChaptersIntoVolumes(
    chapters: ParsedChapterInfo[],
    volumesInfo?: ParsedVolumeInfo[],
    defaultVolumeTitle: string = '正文',
  ): Volume[] {
    const volumeIdGenerator = new UniqueIdGenerator();
    const chapterIdGenerator = new UniqueIdGenerator();
    const now = new Date();
    const volumes: Volume[] = [];

    // 如果有卷信息，按卷分组
    if (volumesInfo && volumesInfo.length > 0) {
      volumesInfo.forEach((volumeInfo, volumeIndex) => {
        const volumeTranslation: Translation = {
          id: generateShortId(),
          translation: '',
          aiModelId: '',
        };

        const volume: Volume = {
          id: volumeIdGenerator.generate(),
          title: {
            original: volumeInfo.title,
            translation: volumeTranslation,
          },
          chapters: [],
        };

        // 计算该卷的章节范围
        const startIndex = volumeInfo.startIndex;
        const nextVolumeInfo = volumesInfo[volumeIndex + 1];
        const endIndex = nextVolumeInfo ? nextVolumeInfo.startIndex : chapters.length;

        // 将该卷的章节添加到卷中
        for (let i = startIndex; i < endIndex; i++) {
          const chapterInfo = chapters[i];
          if (!chapterInfo) continue;

          const chapter = this.createChapter(chapterInfo, chapterIdGenerator, now);
          volume.chapters?.push(chapter);
        }

        if (volume.chapters && volume.chapters.length > 0) {
          volumes.push(volume);
        }
      });
    } else {
      // 如果没有卷信息，使用默认卷
      const defaultVolumeTranslation: Translation = {
        id: generateShortId(),
        translation: '',
        aiModelId: '',
      };

      const defaultVolume: Volume = {
        id: volumeIdGenerator.generate(),
        title: {
          original: defaultVolumeTitle,
          translation: defaultVolumeTranslation,
        },
        chapters: [],
      };

      // 将章节添加到默认卷
      chapters.forEach((chapterInfo) => {
        const chapter = this.createChapter(chapterInfo, chapterIdGenerator, now);
        defaultVolume.chapters?.push(chapter);
      });

      if (defaultVolume.chapters && defaultVolume.chapters.length > 0) {
        volumes.push(defaultVolume);
      }
    }

    return volumes;
  }
}
