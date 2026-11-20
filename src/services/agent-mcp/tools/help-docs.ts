import type { HelpDocument } from 'src/models/help';
import { HelpService } from 'src/services/help-service';
import { useSettingsStore } from 'src/stores/settings';
import { localizedErrorCode } from 'src/utils/localized-error';
import { agentMcpError, type AgentMcpToolSpec } from '../types';
import { readTrimmedString } from './helpers';

/** 正文命中时，片段在命中位置前后各保留的字符数 */
const SNIPPET_RADIUS = 80;

/** 更新日志不是使用说明，不参与「怎么用」的检索 */
function isUsageDoc(doc: HelpDocument): boolean {
  return doc.path !== 'releaseNotes' && doc.categoryId !== 'release-notes';
}

function summarizeDoc(doc: HelpDocument) {
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    description: doc.description,
  };
}

function buildSnippet(markdown: string, lowerQuery: string): string | null {
  const at = markdown.toLowerCase().indexOf(lowerQuery);
  if (at < 0) return null;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(markdown.length, at + lowerQuery.length + SNIPPET_RADIUS);
  const body = markdown.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < markdown.length ? '…' : ''}`;
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
      },
    },
    execute: async (args) => {
      const locale = useSettingsStore().uiLocale;
      const docs = (await HelpService.getIndex(locale)).filter(isUsageDoc);
      const query = readTrimmedString(args.query);
      if (!query) {
        return { locale, query: '', total: docs.length, docs: docs.map(summarizeDoc) };
      }

      const lowerQuery = query.toLowerCase();
      const hits = await Promise.all(
        docs.map(async (doc) => {
          const inMeta =
            doc.title.toLowerCase().includes(lowerQuery) ||
            doc.description.toLowerCase().includes(lowerQuery);
          // 个别文档读取失败时只按标题和简介判断，不让整次搜索失败
          const snippet = await HelpService.getDocument(doc.id, locale)
            .then(({ markdown }) => buildSnippet(markdown, lowerQuery))
            .catch(() => null);
          if (!inMeta && snippet === null) return null;
          return { ...summarizeDoc(doc), ...(snippet !== null ? { snippet } : {}) };
        }),
      );
      const matched = hits.filter((hit) => hit !== null);
      return { locale, query, total: matched.length, docs: matched };
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
