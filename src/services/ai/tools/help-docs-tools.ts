import { validToolQuery } from './tool-feedback';
import { describeTool, stringToolParameter, toolDefinition } from './tool-localization';
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
 * 根据 doc_id 校验、获取索引并定位文档；失败时返回可直接 return 给工具的 JSON 错误字符串。
 */
async function resolveHelpDocById(
  doc_id: unknown,
): Promise<{ ok: true; doc: HelpDocIndex } | { ok: false; response: string }> {
  if (!doc_id || typeof doc_id !== 'string') {
    console.error('[HelpDocs] ❌ 无效的文档 ID', {
      doc_id,
      docIdType: typeof doc_id,
    });
    return {
      ok: false,
      response: JSON.stringify({ success: false, error: '文档 ID 不能为空' }),
    };
  }

  const indexResult = await fetchHelpIndex();
  if (!indexResult.success || !indexResult.data) {
    return {
      ok: false,
      response: JSON.stringify({
        success: false,
        error: indexResult.error || '无法获取帮助文档索引',
      }),
    };
  }

  const doc = indexResult.data.find((d) => d.id === doc_id);
  if (!doc) {
    return {
      ok: false,
      response: JSON.stringify({
        success: false,
        error: `未找到 ID 为 "${doc_id}" 的帮助文档`,
      }),
    };
  }

  return { ok: true, doc };
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
    definition: toolDefinition('search_help_docs', {
      type: 'object',
      properties: {
        query: stringToolParameter('search_help_docs.parameters.properties.query'),
      },
      required: ['query'],
    }),
    handler: async (args, context: ToolContext) => {
      const { query } = args;
      const { onAction } = context;

      if (!validToolQuery(query, 'HelpDocs')) {
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
    definition: toolDefinition('get_help_doc', {
      type: 'object',
      properties: {
        doc_id: {
          type: 'string',
          description: describeTool('get_help_doc.parameters.properties.doc_id'),
        },
      },
      required: ['doc_id'],
    }),
    handler: async (args, context: ToolContext) => {
      const { doc_id } = args;
      const { onAction } = context;

      const resolved = await resolveHelpDocById(doc_id);
      if (!resolved.ok) return resolved.response;
      const { doc } = resolved;

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
    definition: toolDefinition('navigate_to_help_doc', {
      type: 'object',
      properties: {
        doc_id: {
          type: 'string',
          description: describeTool('navigate_to_help_doc.parameters.properties.doc_id'),
        },
        section_id: {
          type: 'string',
          description: describeTool('navigate_to_help_doc.parameters.properties.section_id'),
        },
      },
      required: ['doc_id'],
    }),
    handler: async (args, context: ToolContext) => {
      const { doc_id, section_id } = args as {
        doc_id: string;
        section_id?: string;
      };
      const { onAction } = context;

      const resolved = await resolveHelpDocById(doc_id);
      if (!resolved.ok) return resolved.response;
      const { doc } = resolved;

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
    definition: toolDefinition('list_help_docs', {
      type: 'object',
      properties: {},
      required: [],
    }),
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
