import type { AppLocale } from 'src/models/locale';
import type { HelpDocument } from 'src/models/help';
import { HelpService } from 'src/services/help-service';
import { matchByKeywords } from './keyword-match';

/**
 * 搜索内置使用文档。站内 Agent 的工具与外部 Agent（MCP）的工具共用这一份。
 *
 * 使用文档按标题、简介和正文匹配；更新日志数量多，只按标题和简介匹配，不为搜索去读它们的正文。
 */

/** 正文命中时，片段在命中位置前后各保留的字符数 */
const SNIPPET_RADIUS = 80;

export interface HelpSearchHit {
  doc: HelpDocument;
  /** 正文里有确切写法时，命中位置附近的片段 */
  snippet?: string;
}

/** 更新日志不是使用说明 */
export function isUsageHelpDoc(doc: HelpDocument): boolean {
  return doc.path !== 'releaseNotes' && doc.categoryId !== 'release-notes';
}

function buildSnippet(markdown: string, lowerQuery: string): string | null {
  const at = markdown.toLowerCase().indexOf(lowerQuery);
  if (at < 0) return null;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(markdown.length, at + lowerQuery.length + SNIPPET_RADIUS);
  const body = markdown.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < markdown.length ? '…' : ''}`;
}

export async function searchHelpDocs(
  locale: AppLocale,
  query: string,
  options: {
    /** 写法略有出入也算命中；结果按接近程度排序 */
    fuzzy?: boolean;
    /** 是否把更新日志也纳入结果（只按标题和简介匹配），默认 false */
    includeReleaseNotes?: boolean;
  } = {},
): Promise<HelpSearchHit[]> {
  const docs = (await HelpService.getIndex(locale)).filter(
    (doc) => options.includeReleaseNotes || isUsageHelpDoc(doc),
  );
  // 个别文档读取失败时只按标题和简介判断，不让整次搜索失败
  const loaded = await Promise.all(
    docs.map(async (doc) => ({
      doc,
      markdown: isUsageHelpDoc(doc)
        ? await HelpService.getDocument(doc.id, locale)
            .then(({ markdown }) => markdown)
            .catch(() => '')
        : '',
    })),
  );
  const lowerQuery = query.toLowerCase();
  return matchByKeywords(
    loaded,
    ({ doc, markdown }) => [doc.title, doc.description, markdown],
    [query],
    { fuzzy: options.fuzzy === true },
  ).map(({ doc, markdown }) => {
    const snippet = buildSnippet(markdown, lowerQuery);
    return { doc, ...(snippet !== null ? { snippet } : {}) };
  });
}
