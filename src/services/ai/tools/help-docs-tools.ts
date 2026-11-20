import { validToolQuery, toolErrorJson, caughtToolErrorJson } from './tool-feedback';
import { describeTool, stringToolParameter, toolDefinition } from './tool-localization';
import type { ToolDefinition, ToolContext } from './types';
import type { AppLocale } from 'src/models/locale';
import { AGENT_LOCALE, translateText } from 'src/i18n/translate';
import { HelpService, resolveHelpSection } from 'src/services/help-service';
import { searchHelpDocs } from 'src/services/library-query/help-search';
import { LocalizedError } from 'src/utils/localized-error';

function helpHandler(
  handler: (
    args: Record<string, unknown>,
    context: ToolContext,
    locale: AppLocale,
  ) => Promise<string>,
): ToolDefinition['handler'] {
  return async (args, context) => {
    // 帮助正文按执行界面语言读取；返回给模型的说明固定简中
    const locale = context.languages?.uiLocale ?? 'zh-CN';
    try {
      return await handler(args, context, locale);
    } catch (error) {
      return caughtToolErrorJson(error, 'HELP_REQUEST_FAILED', 'helpFeedback.requestFailed');
    }
  };
}
async function resolveDoc(id: unknown, locale: AppLocale) {
  if (typeof id !== 'string' || !id)
    throw new LocalizedError(
      'HELP_DOC_ID_REQUIRED',
      'helpFeedback.docIdRequired',
      {},
      AGENT_LOCALE,
    );
  const doc = (await HelpService.getIndex(locale)).find((entry) => entry.id === id);
  if (!doc)
    throw new LocalizedError(
      'HELP_DOCUMENT_NOT_FOUND',
      'helpFeedback.notFound',
      { id },
      AGENT_LOCALE,
    );
  return doc;
}

export const helpDocsTools: ToolDefinition[] = [
  {
    definition: toolDefinition('search_help_docs', {
      type: 'object',
      properties: {
        query: stringToolParameter('search_help_docs.parameters.properties.query'),
        fuzzy: {
          type: 'boolean',
          description: describeTool('search_help_docs.parameters.properties.fuzzy'),
        },
      },
      required: ['query'],
    }),
    handler: helpHandler(async (args, { onAction }, locale) => {
      const { query } = args;
      // 只有空白的查询没有可搜的词，共用搜索会把它当作「不过滤」而返回全部文档
      if (!validToolQuery(query, 'HelpDocs') || !query.trim())
        return toolErrorJson('HELP_QUERY_REQUIRED', 'helpFeedback.queryRequired');
      // 搜索与外部 Agent 的工具共用 library-query/help-search；站内保留按标题找更新日志的能力
      const hits = await searchHelpDocs(locale, query, {
        fuzzy: args.fuzzy === true,
        includeReleaseNotes: true,
      });
      const matched = hits.map((hit) => hit.doc);
      onAction?.({
        type: 'search',
        entity: 'help_doc',
        data: {
          query,
          tool_name: 'search_help_docs',
          results: matched,
          name: matched.length ? matched.map((doc) => doc.title).join('、') : undefined,
        },
      });
      return JSON.stringify({
        success: true,
        data: {
          query,
          total: hits.length,
          docs: hits.map(({ doc, snippet }) => ({
            id: doc.id,
            title: doc.title,
            category: doc.category,
            description: doc.description,
            ...(snippet !== undefined ? { snippet } : {}),
          })),
        },
      });
    }),
  },
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
    handler: helpHandler(async ({ doc_id }, { onAction }, locale) => {
      if (typeof doc_id !== 'string' || !doc_id)
        return toolErrorJson('HELP_DOC_ID_REQUIRED', 'helpFeedback.docIdRequired');
      const { doc, markdown, headings } = await HelpService.getDocument(doc_id, locale);
      onAction?.({
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
      return JSON.stringify({
        success: true,
        data: {
          title: doc.title,
          category: doc.category,
          file: doc.file,
          content: markdown,
          sections: headings,
        },
      });
    }),
  },
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
    handler: helpHandler(async ({ doc_id, section_id }, { onAction }, locale) => {
      const doc = await resolveDoc(doc_id, locale);
      const section =
        typeof section_id === 'string' && section_id
          ? resolveHelpSection(doc, section_id)
          : undefined;
      onAction?.({
        type: 'navigate',
        entity: 'help_doc',
        data: {
          doc_id: doc.id,
          doc_title: doc.title,
          ...(section ? { section_id: section } : {}),
          tool_name: 'navigate_to_help_doc',
        },
      });
      return JSON.stringify({
        success: true,
        message: translateText(AGENT_LOCALE, 'helpFeedback.navigated', {
          title: doc.title,
          section: section
            ? translateText(AGENT_LOCALE, 'helpFeedback.section', { id: section })
            : '',
        }),
        doc_id: doc.id,
        doc_title: doc.title,
        ...(section ? { section_id: section } : {}),
      });
    }),
  },
  {
    definition: toolDefinition('list_help_docs', { type: 'object', properties: {}, required: [] }),
    handler: helpHandler(async (_args, { onAction }, locale) => {
      const docs = await HelpService.getIndex(locale);
      const categories: Record<
        string,
        Array<{ id: string; title: string; description: string }>
      > = {};
      for (const doc of docs)
        (categories[doc.category] ??= []).push({
          id: doc.id,
          title: doc.title,
          description: doc.description,
        });
      if (docs.length) {
        const title = translateText(AGENT_LOCALE, 'helpFeedback.listTitle');
        onAction?.({
          type: 'read',
          entity: 'help_doc',
          data: { name: title, title, tool_name: 'list_help_docs', success: true },
        });
      }
      return JSON.stringify({ success: true, data: { total: docs.length, categories } });
    }),
  },
];
