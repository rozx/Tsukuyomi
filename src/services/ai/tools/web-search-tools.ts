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
  try {
    // 使用 Vite 代理路径来避免 CORS 问题
    const isBrowser = typeof window !== 'undefined';
    const searchUrl = isBrowser
      ? `/api/search/?q=${encodeURIComponent(query)}`
      : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
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

      if (response.status >= 400) {
        throw new Error(`搜索请求失败: ${response.status}`);
      }

      // 解析 HTML 响应
      const html = response.data;
      const $ = cheerio.load(html);

      const results: Array<{ title: string; snippet: string; url: string }> = [];

      // 提取搜索结果（尝试多种可能的 CSS 选择器，因为 DuckDuckGo 可能改变结构）
      // 方法 1: 尝试新的选择器
      $('[data-testid="result"]').each((_index, element) => {
        const $el = $(element);
        const title = $el.find('a[data-testid="result-title-a"]').text().trim() || $el.find('h2 a').text().trim();
        const snippet = $el.find('[data-testid="result-snippet"]').text().trim() || $el.find('.result__snippet').text().trim();
        const url = $el.find('a[data-testid="result-title-a"]').attr('href') || $el.find('h2 a').attr('href') || '';

        if (title && snippet) {
          results.push({ title, snippet, url });
        }
      });

      // 方法 2: 如果方法 1 没有结果，尝试旧的选择器
      if (results.length === 0) {
        $('.result').each((_index, element) => {
          const $el = $(element);
          const title = $el.find('.result__title a').text().trim() || $el.find('h2 a').text().trim();
          const snippet = $el.find('.result__snippet').text().trim();
          const url = $el.find('.result__title a').attr('href') || $el.find('h2 a').attr('href') || '';

          if (title && snippet) {
            results.push({ title, snippet, url });
          }
        });
      }

      // 方法 3: 尝试更通用的选择器
      if (results.length === 0) {
        $('article, .web-result, [class*="result"]').each((_index, element) => {
          const $el = $(element);
          const title = $el.find('h2 a, a[href^="http"]').first().text().trim();
          const snippet = $el.find('p, .snippet, [class*="snippet"]').first().text().trim();
          const url = $el.find('h2 a, a[href^="http"]').first().attr('href') || '';

          if (title && snippet && url) {
            results.push({ title, snippet, url });
          }
        });
      }

      // 如果找到了结果，返回
      if (results.length > 0) {
        return {
          success: true,
          results: results.slice(0, 5), // 只返回前 5 个结果
        };
      }

      // 尝试提取即时答案（如果有）
      const instantAnswer =
        $('.zci__result').first().text().trim() ||
        $('[data-testid="zci-answer"]').first().text().trim() ||
        $('.module--knowledge').first().text().trim();

      if (instantAnswer) {
        return {
          success: true,
          answer: instantAnswer,
          results: [],
        };
      }

      // 如果没有找到结果，返回提示（但搜索请求本身是成功的）
      return {
        success: true,
        message: `未找到关于"${query}"的搜索结果。建议使用 AI 模型的内置知识库来回答问题。`,
        results: [],
      };
    } catch (fetchError) {
      // 如果搜索失败，返回提示信息，建议使用 AI 内置知识库
      return {
        success: false,
        error: fetchError instanceof Error ? fetchError.message : '搜索失败',
        message: `网络搜索暂时不可用。建议使用 AI 模型的内置知识库来回答关于"${query}"的问题。AI 模型具有广泛的知识，可以回答大多数一般性问题。`,
      };
    }
  } catch (error) {
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
          '搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据或超出 AI 模型训练数据范围的问题时，可以使用此工具。注意：如果搜索失败，AI 应该使用其内置知识库回答问题。',
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
      if (!query || typeof query !== 'string') {
        return JSON.stringify({
          success: false,
          error: '搜索查询不能为空',
        });
      }

      const result = await searchWeb(query);
      return JSON.stringify(result);
    },
  },
];

