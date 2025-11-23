import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ToolDefinition } from './types';

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
  console.log('[WebSearch] 开始网络搜索', {
    query,
    queryLength: query.length,
  });

  try {
    // 使用 Vite 代理路径来避免 CORS 问题
    const isBrowser = typeof window !== 'undefined';
    const searchUrl = isBrowser
      ? `/api/search/?q=${encodeURIComponent(query)}`
      : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    console.log('[WebSearch] 发送搜索请求', {
      url: searchUrl,
      isBrowser,
      timeout: 30000,
    });

    try {
      const startTime = Date.now();
      const response = await axios.get(searchUrl, {
        timeout: 30000, // 30 秒超时
        headers: isBrowser
          ? {
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            }
          : {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              Referer: 'https://duckduckgo.com/',
            },
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const requestDuration = Date.now() - startTime;
      console.log('[WebSearch] 收到搜索响应', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers['content-type'],
        contentLength: response.data?.length || 0,
        duration: `${requestDuration}ms`,
      });

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

      console.log('[WebSearch] 开始解析 HTML 响应', {
        htmlLength: html.length,
      });

      const results: Array<{ title: string; snippet: string; url: string }> = [];

      // 提取搜索结果（尝试多种可能的 CSS 选择器，因为 DuckDuckGo 可能改变结构）
      // 方法 1: 尝试新的选择器
      let method1Count = 0;
      let method2Count = 0;
      let method3Count = 0;

      method1Count = $('[data-testid="result"]').length;
      console.log('[WebSearch] 尝试方法 1 (data-testid="result")', {
        foundElements: method1Count,
      });

      $('[data-testid="result"]').each((_index, element) => {
        const $el = $(element);
        const title = $el.find('a[data-testid="result-title-a"]').text().trim() || $el.find('h2 a').text().trim();
        const snippet = $el.find('[data-testid="result-snippet"]').text().trim() || $el.find('.result__snippet').text().trim();
        let url = $el.find('a[data-testid="result-title-a"]').attr('href') || $el.find('h2 a').attr('href') || '';

        // 解析 DuckDuckGo 重定向 URL，提取真实 URL
        if (url && url.startsWith('//duckduckgo.com/l/')) {
          try {
            const urlParams = new URLSearchParams(url.split('?')[1] || '');
            const uddgParam = urlParams.get('uddg');
            if (uddgParam) {
              url = decodeURIComponent(uddgParam);
            }
          } catch (e) {
            // 如果解析失败，保持原 URL
            console.warn('[WebSearch] 无法解析重定向 URL', { url, error: e });
          }
        }

        if (title && snippet) {
          results.push({ title, snippet, url });
        }
      });

      // 方法 2: 如果方法 1 没有结果，尝试旧的选择器
      if (results.length === 0) {
        method2Count = $('.result').length;
        console.log('[WebSearch] 尝试方法 2 (.result)', {
          foundElements: method2Count,
        });

      $('.result').each((_index, element) => {
        const $el = $(element);
        const title = $el.find('.result__title a').text().trim() || $el.find('h2 a').text().trim();
        const snippet = $el.find('.result__snippet').text().trim();
        let url = $el.find('.result__title a').attr('href') || $el.find('h2 a').attr('href') || '';

        // 解析 DuckDuckGo 重定向 URL，提取真实 URL
        if (url && url.startsWith('//duckduckgo.com/l/')) {
          try {
            const urlParams = new URLSearchParams(url.split('?')[1] || '');
            const uddgParam = urlParams.get('uddg');
            if (uddgParam) {
              url = decodeURIComponent(uddgParam);
            }
          } catch (e) {
            // 如果解析失败，保持原 URL
            console.warn('[WebSearch] 无法解析重定向 URL', { url, error: e });
          }
        }

        if (title && snippet) {
          results.push({ title, snippet, url });
        }
      });
      }

      // 方法 3: 尝试更通用的选择器
      if (results.length === 0) {
        method3Count = $('article, .web-result, [class*="result"]').length;
        console.log('[WebSearch] 尝试方法 3 (通用选择器)', {
          foundElements: method3Count,
        });

        $('article, .web-result, [class*="result"]').each((_index, element) => {
          const $el = $(element);
          const title = $el.find('h2 a, a[href^="http"]').first().text().trim();
          const snippet = $el.find('p, .snippet, [class*="snippet"]').first().text().trim();
          let url = $el.find('h2 a, a[href^="http"]').first().attr('href') || '';

          // 解析 DuckDuckGo 重定向 URL，提取真实 URL
          if (url && url.startsWith('//duckduckgo.com/l/')) {
            try {
              const urlParams = new URLSearchParams(url.split('?')[1] || '');
              const uddgParam = urlParams.get('uddg');
              if (uddgParam) {
                url = decodeURIComponent(uddgParam);
              }
            } catch (e) {
              // 如果解析失败，保持原 URL
              console.warn('[WebSearch] 无法解析重定向 URL', { url, error: e });
            }
          }

          if (title && snippet && url) {
            results.push({ title, snippet, url });
          }
        });
      }

      console.log('[WebSearch] 解析完成', {
        totalResults: results.length,
        methodUsed: results.length > 0 ? (method1Count > 0 ? '方法1' : $('.result').length > 0 ? '方法2' : '方法3') : '无结果',
      });

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
          console.log('[WebSearch] 找到即时答案', {
            selector,
            answerLength: instantAnswer.length,
            answerPreview: instantAnswer.substring(0, 100) + (instantAnswer.length > 100 ? '...' : ''),
          });
          break;
        }
      }

      // 如果没有找到即时答案，尝试从搜索结果中提取（对于日期查询等）
      if (!instantAnswer && results.length > 0) {
        // 检查前几个结果的标题和摘要是否包含日期信息
        const datePattern = /(\d{4}年|\d{1,2}月\d{1,2}日|星期[一二三四五六日]|今天|明天|昨天|现在|当前|今日|本月|今年|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/;
        
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
              console.log('[WebSearch] 从搜索结果中提取日期信息', {
                source: titleMatch ? 'title' : 'snippet',
                answerLength: instantAnswer.length,
                answerPreview: instantAnswer,
              });
              break;
            }
          }
        }
      }

      // 如果找到了即时答案，返回即时答案和部分结果
      if (instantAnswer) {
        console.log('[WebSearch] ✅ 找到即时答案', {
          answerLength: instantAnswer.length,
          answerPreview: instantAnswer.substring(0, 100) + (instantAnswer.length > 100 ? '...' : ''),
        });
        return {
          success: true,
          answer: instantAnswer,
          results: results.slice(0, 3), // 同时返回前 3 个结果作为参考
        };
      }

      // 如果找到了结果但没有即时答案，返回结果供 AI 分析
      if (results.length > 0) {
        const finalResults = results.slice(0, 5); // 只返回前 5 个结果
        console.log('[WebSearch] ✅ 成功找到搜索结果（无即时答案，需 AI 分析）', {
          totalResults: results.length,
          returnedResults: finalResults.length,
          preview: finalResults.map((r) => ({
            title: r.title.substring(0, 50) + (r.title.length > 50 ? '...' : ''),
            snippet: r.snippet ? r.snippet.substring(0, 50) + (r.snippet.length > 50 ? '...' : '') : '',
            url: r.url,
          })),
        });
        
        // 返回结果，让 AI 从 results 中提取信息
        return {
          success: true,
          results: finalResults,
        };
      }

      // 如果没有找到结果，返回提示（但搜索请求本身是成功的）
      console.warn('[WebSearch] ⚠️ 未找到搜索结果', {
        query,
        htmlLength: html.length,
      });
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
    handler: async (args) => {
      const { query } = args;
      console.log('[WebSearch] 工具被调用', {
        query,
        queryType: typeof query,
      });

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
      console.log('[WebSearch] 工具执行完成', {
        query,
        success: result.success,
        hasResults: !!result.results && result.results.length > 0,
        resultsCount: result.results?.length || 0,
        hasAnswer: !!result.answer,
        hasError: !!result.error,
        hasMessage: !!result.message,
      });
      return JSON.stringify(result);
    },
  },
];

