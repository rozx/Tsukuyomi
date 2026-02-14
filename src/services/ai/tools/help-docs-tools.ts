import axios from 'axios';
import type { ToolDefinition, ToolContext } from './types';
import { getAssetUrl } from 'src/utils/assets';

interface HelpDocIndex {
  id: string;
  title: string;
  file: string;
  path: string;
  category: string;
  description: string;
}

async function fetchHelpIndex(): Promise<{
  success: boolean;
  data?: HelpDocIndex[];
  error?: string;
}> {
  try {
    const response = await axios.get<HelpDocIndex[]>(getAssetUrl('help/index.json'), {
      timeout: 10000,
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[HelpDocs] ❌ 获取帮助文档索引失败', { error: errorMessage });
    return {
      success: false,
      error: `获取帮助文档索引失败: ${errorMessage}`,
    };
  }
}

/**
 * @param docPath 文档路径（来自 index.json 的 path 字段，如 "help" 或 "releaseNotes"）
 * @param file 文档文件名（来自 index.json 的 file 字段）
 */
async function fetchHelpDoc(
  docPath: string,
  file: string,
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
}> {
  try {
    const response = await axios.get<string>(getAssetUrl(`${docPath}/${file}`), {
      timeout: 10000,
      responseType: 'text',
    });
    return { success: true, content: response.data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[HelpDocs] ❌ 获取帮助文档内容失败', {
      path: `/${docPath}/${file}`,
      error: errorMessage,
    });
    return {
      success: false,
      error: `获取帮助文档内容失败: ${errorMessage}`,
    };
  }
}

export const helpDocsTools: ToolDefinition[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_help_docs',
        description:
          '根据关键词搜索应用的帮助文档。在标题和描述中进行模糊匹配。当用户询问应用的使用方法、功能介绍、操作指南等问题时，使用此工具搜索相关帮助文档。',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，可以是功能名称、操作描述等',
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
        console.error('[HelpDocs] ❌ 无效的搜索查询', {
          query,
          queryType: typeof query,
        });
        return JSON.stringify({
          success: false,
          error: '搜索关键词不能为空',
        });
      }

      const indexResult = await fetchHelpIndex();
      if (!indexResult.success || !indexResult.data) {
        return JSON.stringify({
          success: false,
          error: indexResult.error || '无法获取帮助文档索引',
        });
      }

      // 执行大小写不敏感的关键词搜索
      const lowerQuery = query.toLowerCase();
      const matchedDocs = indexResult.data.filter((doc) => {
        const titleMatch = doc.title.toLowerCase().includes(lowerQuery);
        const descMatch = doc.description.toLowerCase().includes(lowerQuery);
        return titleMatch || descMatch;
      });

      const result = {
        success: true,
        data: {
          query,
          total: matchedDocs.length,
          docs: matchedDocs.map((doc) => ({
            id: doc.id,
            title: doc.title,
            category: doc.category,
            description: doc.description,
          })),
        },
      };

      const matchedNames = matchedDocs.map((doc) => doc.title).filter(Boolean);
      // 报告操作
      if (onAction) {
        onAction({
          type: 'search',
          entity: 'help_doc',
          data: {
            query,
            tool_name: 'search_help_docs',
            results: matchedDocs,
            name: matchedNames.length > 0 ? matchedNames.join('、') : undefined,
          },
        });
      }

      return JSON.stringify(result);
    },
  },

  // get_help_doc - 获取指定帮助文档的完整内容
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_help_doc',
        description:
          '获取指定帮助文档的完整内容。需要传入文档 ID（可通过 search_help_docs 或 list_help_docs 获取）。返回文档的标题、分类和 Markdown 格式的完整内容。',
        parameters: {
          type: 'object',
          properties: {
            doc_id: {
              type: 'string',
              description: '帮助文档的唯一 ID（例如 "front-page"、"ai-models-guide"）',
            },
          },
          required: ['doc_id'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { doc_id } = args;
      const { onAction } = context;

      if (!doc_id || typeof doc_id !== 'string') {
        console.error('[HelpDocs] ❌ 无效的文档 ID', {
          doc_id,
          docIdType: typeof doc_id,
        });
        return JSON.stringify({
          success: false,
          error: '文档 ID 不能为空',
        });
      }

      const indexResult = await fetchHelpIndex();
      if (!indexResult.success || !indexResult.data) {
        return JSON.stringify({
          success: false,
          error: indexResult.error || '无法获取帮助文档索引',
        });
      }

      // 查找指定 ID 的文档
      const doc = indexResult.data.find((d) => d.id === doc_id);
      if (!doc) {
        return JSON.stringify({
          success: false,
          error: `未找到 ID 为 "${doc_id}" 的帮助文档`,
        });
      }

      // 获取文档内容
      const contentResult = await fetchHelpDoc(doc.path, doc.file);
      if (!contentResult.success || !contentResult.content) {
        return JSON.stringify({
          success: false,
          error: contentResult.error || '无法获取文档内容',
        });
      }

      const result = {
        success: true,
        data: {
          title: doc.title,
          category: doc.category,
          file: doc.file,
          content: contentResult.content,
        },
      };

      // 报告操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'help_doc',
          data: {
            name: doc.title,
            title: doc.title,
            url: `/${doc.path}/${doc.file}`,
            tool_name: 'get_help_doc',
            success: true,
          },
        });
      }

      return JSON.stringify(result);
    },
  },

  // navigate_to_help_doc - 导航到指定的帮助文档页面
  {
    definition: {
      type: 'function',
      function: {
        name: 'navigate_to_help_doc',
        description:
          '导航到指定的帮助文档页面。将用户界面跳转到帮助中心并打开指定的文档，可选定位到文档内的具体章节。当用户询问使用方法后需要查看完整文档，或需要引导用户前往相关帮助页面时使用此工具。',
        parameters: {
          type: 'object',
          properties: {
            doc_id: {
              type: 'string',
              description:
                '帮助文档的唯一 ID（例如 "front-page"、"ai-models-guide"），可通过 search_help_docs 或 list_help_docs 获取',
            },
            section_id: {
              type: 'string',
              description:
                '文档内的章节锚点 ID（可选）。用于定位到文档内的具体章节，例如 "openai-配置"。锚点 ID 通常是章节标题的小写形式，空格替换为连字符',
            },
          },
          required: ['doc_id'],
        },
      },
    },
    handler: async (args, context: ToolContext) => {
      const { doc_id, section_id } = args as {
        doc_id: string;
        section_id?: string;
      };
      const { onAction } = context;

      if (!doc_id || typeof doc_id !== 'string') {
        console.error('[HelpDocs] ❌ 无效的文档 ID', {
          doc_id,
          docIdType: typeof doc_id,
        });
        return JSON.stringify({
          success: false,
          error: '文档 ID 不能为空',
        });
      }

      const indexResult = await fetchHelpIndex();
      if (!indexResult.success || !indexResult.data) {
        return JSON.stringify({
          success: false,
          error: indexResult.error || '无法获取帮助文档索引',
        });
      }

      // 查找指定 ID 的文档
      const doc = indexResult.data.find((d) => d.id === doc_id);
      if (!doc) {
        return JSON.stringify({
          success: false,
          error: `未找到 ID 为 "${doc_id}" 的帮助文档`,
        });
      }

      // 触发导航操作
      if (onAction) {
        onAction({
          type: 'navigate',
          entity: 'help_doc',
          data: {
            doc_id,
            doc_title: doc.title,
            ...(section_id ? { section_id } : {}),
            tool_name: 'navigate_to_help_doc',
          },
        });
      }

      const sectionInfo = section_id ? ` (章节: ${section_id})` : '';
      return JSON.stringify({
        success: true,
        message: `已导航到帮助文档: ${doc.title}${sectionInfo}`,
        doc_id,
        doc_title: doc.title,
        ...(section_id ? { section_id } : {}),
      });
    },
  },

  // list_help_docs - 列出所有可用的帮助文档
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_help_docs',
        description:
          '列出所有可用的帮助文档，按类别分组。当用户想了解有哪些帮助文档可用，或需要浏览帮助目录时使用此工具。',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    handler: async (_args, context: ToolContext) => {
      const { onAction } = context;

      const indexResult = await fetchHelpIndex();
      if (!indexResult.success || !indexResult.data) {
        return JSON.stringify({
          success: false,
          error: indexResult.error || '无法获取帮助文档索引',
        });
      }

      const docs = indexResult.data;

      if (docs.length === 0) {
        return JSON.stringify({
          success: true,
          data: {
            total: 0,
            categories: {},
          },
        });
      }

      // 按类别分组文档
      const categories: Record<
        string,
        Array<{ id: string; title: string; description: string }>
      > = {};
      for (const doc of docs) {
        if (!categories[doc.category]) {
          categories[doc.category] = [];
        }
        categories[doc.category]!.push({
          id: doc.id,
          title: doc.title,
          description: doc.description,
        });
      }

      const result = {
        success: true,
        data: {
          total: docs.length,
          categories,
        },
      };

      // 报告操作
      if (onAction) {
        onAction({
          type: 'read',
          entity: 'help_doc',
          data: {
            name: '帮助文档列表',
            title: '帮助文档列表',
            tool_name: 'list_help_docs',
            success: true,
          },
        });
      }

      return JSON.stringify(result);
    },
  },
];
