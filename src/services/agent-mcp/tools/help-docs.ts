import { isUsageHelpDoc, searchHelpDocs } from 'src/services/library-query/help-search';
import type { HelpDocument } from 'src/models/help';
import { HelpService } from 'src/services/help-service';
import { useSettingsStore } from 'src/stores/settings';
import { localizedErrorCode } from 'src/utils/localized-error';
import { agentMcpError, type AgentMcpToolSpec } from '../types';
import { FUZZY_PROPERTY, readTrimmedString } from './helpers';

function summarizeDoc(doc: HelpDocument) {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    description: doc.description,
  };
}

export const agentMcpHelpTools: AgentMcpToolSpec[] = [
  {
    name: 'search_help_docs',
    description:
      "Search the built-in Tsukuyomi user guide (in the user's UI language) by title, description and content; omit query to list every guide. Use this, then get_help_doc, whenever the user asks how to do something in Tsukuyomi instead of answering from memory.",
    category: 'context',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: false,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword to look for (case-insensitive). Omit to list all guides.',
        },
        fuzzy: FUZZY_PROPERTY,
      },
    },
    execute: async (args) => {
      const locale = useSettingsStore().uiLocale;
      const query = readTrimmedString(args.query);
      if (!query) {
        const docs = (await HelpService.getIndex(locale)).filter(isUsageHelpDoc);
        return { locale, query: '', total: docs.length, docs: docs.map(summarizeDoc) };
      }
      // 搜索本身与站内工具共用 library-query/help-search
      const hits = await searchHelpDocs(locale, query, { fuzzy: args.fuzzy === true });
      return {
        locale,
        query,
        total: hits.length,
        docs: hits.map(({ doc, snippet }) => ({
          ...summarizeDoc(doc),
          ...(snippet !== undefined ? { snippet } : {}),
        })),
      };
    },
  },
  {
    name: 'get_help_doc',
    description:
      "Read one built-in Tsukuyomi user guide in full (Markdown, in the user's UI language). Get doc_id from search_help_docs.",
    category: 'context',
    permission: 'read_only',
    readOnlyHint: true,
    requiresBookStore: false,
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'string', description: 'Guide ID returned by search_help_docs.' },
      },
      required: ['doc_id'],
    },
    execute: async (args) => {
      const docId = readTrimmedString(args.doc_id);
      if (!docId) return agentMcpError('INVALID_ARGS', 'doc_id is required.');
      const locale = useSettingsStore().uiLocale;
      try {
        const { doc, markdown, headings } = await HelpService.getDocument(docId, locale);
        return {
          locale,
          ...summarizeDoc(doc),
          sections: headings.map((heading) => heading.text),
          content: markdown,
        };
      } catch (error) {
        if (localizedErrorCode(error) === 'HELP_DOCUMENT_NOT_FOUND') {
          return agentMcpError(
            'HELP_DOC_NOT_FOUND',
            `Help document not found: ${docId}. Call search_help_docs to list available guides.`,
          );
        }
        throw error;
      }
    },
  },
];
