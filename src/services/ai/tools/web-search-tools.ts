import axios from 'axios';
import type { ToolDefinition, ToolContext } from './types';
import { GlobalConfig } from 'src/services/global-config-cache';

const TAVILY_API_URL = 'https://api.tavily.com';

/**
 * 使用 Tavily Search API (REST)
 * 文档: https://docs.tavily.com/docs/tavily-api/rest_api
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
    // 获取 Tavily API Key
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
    const apiKey = GlobalConfig.getTavilyApiKey();

    if (!apiKey) {
      console.warn('[WebSearch] ⚠️ 未配置 Tavily API Key');
      return {
        success: false,
        error: '未配置 Tavily API Key',
        message:
          '请在设置中配置 Tavily API Key 以使用网络搜索功能。您可以在 https://tavily.com/ 注册并获取 API Key。',
      };
    }

    // 调用 Tavily Search API
    const response = await axios.post(
      `${TAVILY_API_URL}/search`,
      {
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    // 转换结果格式以保持与旧版本的兼容性
    const results = response.data.results?.map((result: any) => ({
      title: result.title,
      snippet: result.content,
      url: result.url,
    })) || [];

    const returnType: {
      success: boolean;
      results?: Array<{ title: string; snippet: string; url: string }>;
      answer?: string;
    } = {
      success: true,
      results,
    };

    if (response.data.answer) {
      returnType.answer = response.data.answer;
    }

    return returnType;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearch] ❌ 搜索请求失败', {
      query,
      error: errorMessage,
    });

    // 检查是否是 API Key 相关错误
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized') ||
        (axios.isAxiosError(error) && error.response?.status === 401)) {
      return {
        success: false,
        error: 'Tavily API Key 无效',
        message: '请检查设置的 Tavily API Key 是否正确。您可以在 https://tavily.com/ 获取有效的 API Key。',
      };
    }

    return {
      success: false,
      error: errorMessage,
      message: `网络搜索暂时不可用: ${errorMessage}。建议使用 AI 模型的内置知识库来回答关于"${query}"的问题。`,
    };
  }
}

/**
 * 使用 Tavily Extract API 提取网页内容
 * 文档: https://docs.tavily.com/docs/tavily-api/rest_api/1-extract
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

    // 获取 Tavily API Key
    await GlobalConfig.ensureInitialized({ ensureSettings: true, ensureBooks: false });
    const apiKey = GlobalConfig.getTavilyApiKey();

    if (!apiKey) {
      console.warn('[WebPage] ⚠️ 未配置 Tavily API Key');
      return {
        success: false,
        error: '未配置 Tavily API Key',
        message:
          '请在设置中配置 Tavily API Key 以使用网页提取功能。您可以在 https://tavily.com/ 注册并获取 API Key。',
      };
    }

    // 调用 Tavily Extract API
    const response = await axios.post(
      `${TAVILY_API_URL}/extract`,
      {
        api_key: apiKey,
        urls: [url],
        extract_depth: 'basic',
        include_images: false,
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    // Tavily extract 返回 results 数组，取第一个结果
    const firstResult = response.data.results?.[0];

    if (!firstResult) {
      return {
        success: false,
        error: '无法提取网页内容',
        message: `Tavily 无法提取网页 ${url} 的内容。该网页可能无法访问或内容为空。`,
      };
    }

    // 从 rawContent 中提取标题
    const rawContent = firstResult.rawContent || '';
    let title = url;

    // 尝试从 HTML 中提取 title
    const titleMatch = rawContent.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }

    // 移除 HTML 标签获取纯文本
    const text = rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      success: true,
      title,
      text: text.substring(0, 50000), // 限制长度
      content: rawContent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebPage] ❌ 网页获取失败', {
      url,
      error: errorMessage,
    });

    // 检查是否是 API Key 相关错误
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized') ||
        (axios.isAxiosError(error) && error.response?.status === 401)) {
      return {
        success: false,
        error: 'Tavily API Key 无效',
        message: '请检查设置的 Tavily API Key 是否正确。',
      };
    }

    return {
      success: false,
      error: errorMessage,
      message: `无法访问网页 ${url}: ${errorMessage}。`,
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
          '搜索网络以获取最新信息或回答一般性问题。当用户询问需要最新信息、实时数据或超出 AI 模型训练数据范围的问题时，可以使用此工具。[警告] 重要：当工具返回 results 数组时，必须仔细阅读每个结果的 title 和 snippet，从中提取关键信息来回答用户的问题。如果返回了 answer 字段，直接使用该答案。只有在搜索失败（success: false）时才使用 AI 的内置知识库。',
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
          '直接访问指定的网页并提取其内容。当用户提供了具体的网页 URL 或需要查看特定网页的详细内容时使用此工具。工具会提取网页的标题和主要内容文本，供 AI 分析。[警告] 重要：使用此工具时，必须仔细阅读返回的 text 内容，从中提取关键信息来回答用户的问题。如果返回了 error，说明无法访问该网页。',
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
