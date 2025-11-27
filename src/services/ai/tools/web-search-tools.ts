import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ToolDefinition, ToolContext } from './types';
import { ProxyService } from 'src/services/proxy-service';
import { useElectron } from 'src/composables/useElectron';

/**
 * 使用 DuckDuckGo 搜索（通过 Vite 代理）
 * 使用 /api/search 代理路径来避免 CORS 问题
 */
async function searchWeb(query: string): Promise<{
  success: boolean;
  results?: Array<{
    title: string;
    snippet: string;
    url: string;
  }>;
  answer?: string;
  error?: string;
  message?: string;
}> {
  try {
    const { isBrowser } = useElectron();
    const originalSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    let response;
    // 如果代理未启用且是浏览器环境，使用内部搜索路径
    if (!ProxyService.isProxyEnabled() && isBrowser.value) {
      response = await axios.get(`/api/search/?q=${encodeURIComponent(query)}`, {
        timeout: 30000,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        },
        validateStatus: (status) => status >= 200 && status < 400,
      });
    } else {
      // 使用代理服务的自动切换功能执行请求
      response = await ProxyService.executeWithAutoSwitch(
        originalSearchUrl,
        async (searchUrl: string) => {
          return await axios.get(searchUrl, {
            timeout: 30000, // 30 秒超时
            headers: isBrowser.value
              ? {
                  Accept:
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
                }
              : {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  Accept:
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
                  'Accept-Encoding': 'gzip, deflate, br',
                  Referer: 'https://duckduckgo.com/',
                },
            validateStatus: (status) => status >= 200 && status < 400,
          });
        },
        {
          maxRetries: 3,
        },
      );
    }

    if (response.status >= 400) {
      console.error('[WebSearch] ❌ 搜索请求失败', {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`搜索请求失败: ${response.status}`);
    }

    // 解析 HTML 响应
    const html = response.data;
    const $ = cheerio.load(html);

    try {
      const results: Array<{ title: string; snippet: string; url: string }> = [];

      // 辅助函数：解析 DuckDuckGo 重定向 URL
      const parseDuckDuckGoUrl = (url: string): string => {
        if (url && (url.startsWith('//duckduckgo.com/l/') || url.startsWith('/l/'))) {
          try {
            const urlParams = new URLSearchParams(url.split('?')[1] || '');
            const uddgParam = urlParams.get('uddg');
            if (uddgParam) {
              return decodeURIComponent(uddgParam);
            }
          } catch (e) {
            console.warn('[WebSearch] 无法解析重定向 URL', { url, error: e });
          }
        }
        return url;
      };

      // 辅助函数：提取结果
      const extractResult = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $el: cheerio.Cheerio<any>,
        titleSelectors: string[],
        snippetSelectors: string[],
        urlSelectors: string[],
      ): { title: string; snippet: string; url: string } | null => {
        let title = '';
        let snippet = '';
        let url = '';

        // 尝试多个选择器提取标题
        for (const selector of titleSelectors) {
          const text = $el.find(selector).first().text().trim();
          if (text) {
            title = text;
            break;
          }
        }

        // 尝试多个选择器提取摘要
        for (const selector of snippetSelectors) {
          const text = $el.find(selector).first().text().trim();
          if (text) {
            snippet = text;
            break;
          }
        }

        // 尝试多个选择器提取 URL
        for (const selector of urlSelectors) {
          const href = $el.find(selector).first().attr('href');
          if (href) {
            url = href;
            break;
          }
        }

        // 解析 URL
        url = parseDuckDuckGoUrl(url);

        // 如果至少有一个标题或摘要，就认为是一个有效结果
        if (title || snippet) {
          return {
            title: title || snippet.substring(0, 50) + '...',
            snippet: snippet || title,
            url,
          };
        }

        return null;
      };

      // 提取搜索结果（尝试多种可能的 CSS 选择器，因为 DuckDuckGo 可能改变结构）
      // 方法 1: 尝试新的选择器（data-testid）
      $('[data-testid="result"]').each((_index, element) => {
        const result = extractResult(
          $(element),
          ['a[data-testid="result-title-a"]', 'h2 a', 'a.result__a', '.result__title a'],
          ['[data-testid="result-snippet"]', '.result__snippet', '.result__body'],
          ['a[data-testid="result-title-a"]', 'h2 a', 'a.result__a', '.result__title a'],
        );
        if (result) {
          results.push(result);
        }
      });

      // 方法 2: 尝试旧的选择器（class-based）
      if (results.length === 0) {
        $('.result, .web-result, .result__body').each((_index, element) => {
          const result = extractResult(
            $(element),
            ['.result__title a', 'h2 a', 'a.result__a', '.result__title'],
            ['.result__snippet', '.result__body', 'p'],
            ['.result__title a', 'h2 a', 'a.result__a'],
          );
          if (result) {
            results.push(result);
          }
        });
      }

      // 方法 3: 尝试更通用的选择器（基于链接和文本）
      if (results.length === 0) {
        // 查找所有包含 DuckDuckGo 重定向链接的元素，这些通常是搜索结果
        $('a[href*="duckduckgo.com/l/"]').each((_index, element) => {
          const $link = $(element);
          const $parent = $link.closest('.result, .web-result, article, [class*="result"]').length
            ? $link.closest('.result, .web-result, article, [class*="result"]')
            : $link.parent().parent();
          const href = $link.attr('href') || '';

          const title = $link.text().trim();
          if (!title || title.length < 5) {
            return;
          }

          // 尝试找到摘要（在链接附近的文本）
          let snippet = '';
          const $snippet = $parent.find('.result__snippet, .result__body, p').first();
          if ($snippet.length > 0) {
            snippet = $snippet.text().trim();
          } else {
            // 如果没有找到专门的摘要元素，尝试从父元素中提取文本
            const parentText = $parent.text().trim();
            const titleIndex = parentText.indexOf(title);
            if (titleIndex >= 0) {
              snippet = parentText
                .substring(titleIndex + title.length)
                .trim()
                .substring(0, 200);
            }
          }

          const url = parseDuckDuckGoUrl(href);
          if (title && url) {
            results.push({
              title,
              snippet: snippet || title,
              url,
            });
          }
        });
      }

      // 方法 4: 尝试基于表格行的结果（DuckDuckGo HTML 版本可能使用表格）
      if (results.length === 0) {
        $('table.result, tr.result').each((_index, element) => {
          const result = extractResult(
            $(element),
            ['a', 'h2 a', '.result__title a'],
            ['td', '.result__snippet', 'p'],
            ['a[href*="duckduckgo.com/l/"]', 'a[href^="http"]'],
          );
          if (result) {
            results.push(result);
          }
        });
      }

      // 尝试提取即时答案（如果有）
      // 尝试多种选择器来查找即时答案
      let instantAnswer = '';
      const instantAnswerSelectors = [
        '.zci__result',
        '[data-testid="zci-answer"]',
        '.module--knowledge',
        '.zcm__answer',
        '.zcm__text',
        '.instant-answer',
        '.ia-module',
      ];

      for (const selector of instantAnswerSelectors) {
        const answer = $(selector).first().text().trim();
        if (answer && answer.length > 0) {
          instantAnswer = answer;
          break;
        }
      }

      // 如果没有找到即时答案，尝试从搜索结果中提取（对于日期查询等）
      if (!instantAnswer && results.length > 0) {
        // 检查前几个结果的标题和摘要是否包含日期信息
        const datePattern =
          /(\d{4}年|\d{1,2}月\d{1,2}日|星期[一二三四五六日]|今天|明天|昨天|现在|当前|今日|本月|今年|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/;

        for (const result of results.slice(0, 3)) {
          if (!result) continue;

          // 检查标题和摘要
          const titleMatch = result.title && datePattern.test(result.title);
          const snippetMatch = result.snippet && datePattern.test(result.snippet);

          if (titleMatch || snippetMatch) {
            // 尝试从标题和摘要中提取日期信息
            const dateInfo = result.title + (result.snippet ? ' ' + result.snippet : '');
            if (dateInfo.length < 300) {
              instantAnswer = dateInfo;
              break;
            }
          }
        }
      }

      // 如果找到了即时答案，返回即时答案和部分结果
      if (instantAnswer) {
        return {
          success: true,
          answer: instantAnswer,
          results: results.slice(0, 3), // 同时返回前 3 个结果作为参考
        };
      }

      // 如果找到了结果但没有即时答案，返回结果供 AI 分析
      if (results.length > 0) {
        const finalResults = results.slice(0, 5); // 只返回前 5 个结果

        // 返回结果，让 AI 从 results 中提取信息
        return {
          success: true,
          results: finalResults,
        };
      }

      // 如果没有找到结果，添加调试信息并返回提示（但搜索请求本身是成功的）
      // 在开发模式下输出 HTML 片段以便调试
      const isDev = import.meta.env.DEV;
      if (isDev) {
        // 尝试查找一些常见的元素来了解 HTML 结构
        const bodyText = $('body').text().substring(0, 500);
        const hasResultElements = {
          'data-testid="result"': $('[data-testid="result"]').length,
          '.result': $('.result').length,
          '.web-result': $('.web-result').length,
          'a[href*="duckduckgo.com/l/"]': $('a[href*="duckduckgo.com/l/"]').length,
          article: $('article').length,
          'table.result': $('table.result').length,
        };

        console.warn('[WebSearch] ⚠️ 未找到搜索结果 - 调试信息', {
          query,
          htmlLength: html.length,
          foundElements: hasResultElements,
          bodyTextPreview: bodyText,
          // 输出一些可能的链接
          links: $('a[href]')
            .slice(0, 5)
            .map((_i, el) => ({
              text: $(el).text().trim().substring(0, 50),
              href: $(el).attr('href')?.substring(0, 100),
            }))
            .get(),
        });
      } else {
        console.warn('[WebSearch] ⚠️ 未找到搜索结果', {
          query,
          htmlLength: html.length,
        });
      }

      return {
        success: true,
        message: `未找到关于"${query}"的搜索结果。建议使用 AI 模型的内置知识库来回答问题。`,
        results: [],
      };
    } catch (fetchError) {
      // 如果搜索失败，返回提示信息，建议使用 AI 内置知识库
      console.error('[WebSearch] ❌ 搜索请求失败', {
        query,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        errorStack: fetchError instanceof Error ? fetchError.stack : undefined,
      });
      return {
        success: false,
        error: fetchError instanceof Error ? fetchError.message : '搜索失败',
        message: `网络搜索暂时不可用。建议使用 AI 模型的内置知识库来回答关于"${query}"的问题。AI 模型具有广泛的知识，可以回答大多数一般性问题。`,
      };
    }
  } catch (error) {
    console.error('[WebSearch] ❌ 发生未知错误', {
      query,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败',
      message: '搜索功能暂时不可用，请使用 AI 模型的内置知识库回答问题。',
    };
  }
}

/**
 * 直接访问网页并提取内容
 * 在浏览器环境中使用服务器代理路径（如需要）
 * 在 Electron/Node.js/Bun 中直接访问
 */
async function fetchWebpage(url: string): Promise<{
  success: boolean;
  title?: string;
  content?: string;
  text?: string;
  error?: string;
  message?: string;
}> {
  try {
    // 验证 URL
    try {
      new URL(url);
    } catch {
      return {
        success: false,
        error: '无效的 URL 格式',
        message: `无法解析 URL: ${url}`,
      };
    }

    const { isBrowser } = useElectron();

    // 使用代理服务的自动切换功能执行请求
    const response = await ProxyService.executeWithAutoSwitch(
      url,
      async (fetchUrl: string) => {
        // 设置请求头
        const headers: Record<string, string> = {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        };

        // 只在非浏览器环境（如 Node.js/Bun）中设置这些请求头
        if (!isBrowser.value) {
          headers['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
          headers['Accept-Encoding'] = 'gzip, deflate, br';
        }

        return await axios.get(fetchUrl, {
          timeout: 30000, // 30 秒超时
          headers,
          validateStatus: (status) => status >= 200 && status < 400,
        });
      },
      {
        maxRetries: 3,
      },
    );

    try {
      if (response.status >= 400) {
        console.error('[WebPage] ❌ 网页请求失败', {
          status: response.status,
          statusText: response.statusText,
          url,
        });
        throw new Error(`网页请求失败: ${response.status}`);
      }

      // 处理响应数据
      // 直接访问返回 HTML
      const html: string = response.data;

      // 解析 HTML
      const $ = cheerio.load(html);

      // 提取标题
      const title =
        $('title').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('h1').first().text().trim() ||
        '';

      // 移除脚本和样式标签
      $('script, style, noscript, iframe, embed, object').remove();

      // 提取主要内容 - 只使用 body 内容
      const mainContent = $('body').text().trim();

      // 清理文本：移除多余的空白字符
      const cleanedText = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      // 限制内容长度（避免返回过多内容）
      const maxLength = 50000; // 最多 50KB 文本
      const finalText =
        cleanedText.length > maxLength ? cleanedText.substring(0, maxLength) + '...' : cleanedText;

      // 提取 body 的 HTML 内容
      const bodyHtml = $('body').html() || '';
      const maxHtmlLength = 100000; // 最多 100KB HTML
      const bodyContent =
        bodyHtml.length > maxHtmlLength ? bodyHtml.substring(0, maxHtmlLength) + '...' : bodyHtml;

      const result: {
        success: boolean;
        title?: string;
        content?: string;
        text?: string;
        error?: string;
        message?: string;
      } = {
        success: true,
        content: bodyContent, // 只保留 body 的 HTML
        text: finalText,
      };

      if (title) {
        result.title = title;
      }

      return result;
    } catch (fetchError) {
      console.error('[WebPage] ❌ 网页获取失败', {
        url,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        errorStack: fetchError instanceof Error ? fetchError.stack : undefined,
      });
      return {
        success: false,
        error: fetchError instanceof Error ? fetchError.message : '网页获取失败',
        message: `无法访问网页 ${url}。可能是网络问题、网页不存在或访问被拒绝。`,
      };
    }
  } catch (error) {
    console.error('[WebPage] ❌ 发生未知错误', {
      url,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : '网页获取失败',
      message: '网页访问功能暂时不可用。',
    };
  }
}

export const webSearchTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_web',
        description:
          '搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据或超出 AI 模型训练数据范围的问题时，可以使用此工具。⚠️ 重要：当工具返回 results 数组时，必须仔细阅读每个结果的 title 和 snippet，从中提取关键信息来回答用户的问题。如果返回了 answer 字段，直接使用该答案。只有在搜索失败（success: false）时才使用 AI 的内置知识库。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询关键词或问题',
            },
          },
          required: ['query'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { query } = args;
      const { onAction } = context;

      if (!query || typeof query !== 'string') {
        console.error('[WebSearch] ❌ 无效的搜索查询', {
          query,
          queryType: typeof query,
        });
        return JSON.stringify({
          success: false,
          error: '搜索查询不能为空',
        });
      }

      const result = await searchWeb(query);

      // 报告操作
      if (onAction) {
        onAction({
          type: 'web_search',
          entity: 'web',
          data: {
            query,
            results: result.results || [],
          },
        });
      }

      return JSON.stringify(result);
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'fetch_webpage',
        description:
          '直接访问指定的网页并提取其内容。当用户提供了具体的网页 URL 或需要查看特定网页的详细内容时使用此工具。工具会提取网页的标题和主要内容文本，供 AI 分析。⚠️ 重要：使用此工具时，必须仔细阅读返回的 text 内容，从中提取关键信息来回答用户的问题。如果返回了 error，说明无法访问该网页。',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: '要访问的网页 URL（必须是完整的 URL，包含 http:// 或 https://）',
            },
          },
          required: ['url'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { url } = args;
      const { onAction } = context;

      if (!url || typeof url !== 'string') {
        console.error('[WebPage] ❌ 无效的 URL', {
          url,
          urlType: typeof url,
        });
        return JSON.stringify({
          success: false,
          error: 'URL 不能为空',
        });
      }

      const result = await fetchWebpage(url);

      // 报告操作
      if (onAction) {
        const actionData: { url: string; title?: string; success: boolean } = {
          url,
          success: result.success,
        };
        if (result.title) {
          actionData.title = result.title;
        }
        onAction({
          type: 'web_fetch',
          entity: 'web',
          data: actionData,
        });
      }

      return JSON.stringify(result);
    },
  },
];
