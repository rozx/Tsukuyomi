import axios from 'axios';
import { marked, type Tokens } from 'marked';
import type { AppLocale } from 'src/models/locale';
import type { HelpDocument, HelpContent, HelpHeading } from 'src/models/help';
import { getAssetUrl } from 'src/utils/assets';
import { LocalizedError } from 'src/utils/localized-error';
import { getErrorMessage } from 'src/utils/error-message';
import { translateText } from 'src/i18n/translate';

export function parseHelpHeading(text: string, level: number): HelpHeading {
  const explicit = text.match(/\s+\{#([a-zA-Z0-9_-]+)\}\s*$/);
  const visible = explicit ? text.slice(0, explicit.index).trim() : text;
  const legacy = visible
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return { id: explicit?.[1] ?? legacy, text: visible, level };
}
export function resolveHelpSection(
  doc: Pick<HelpDocument, 'sectionAliases'>,
  section: string,
): string {
  let decoded = section;
  try {
    decoded = decodeURIComponent(section);
  } catch {
    /* 旧损坏链接仍按原值尝试。 */
  }
  const aliases = doc.sectionAliases;
  return aliases && Object.hasOwn(aliases, decoded) && typeof aliases[decoded] === 'string'
    ? aliases[decoded]!
    : decoded;
}
function normalizeDocument(value: unknown, locale: AppLocale): HelpDocument {
  if (!value || typeof value !== 'object')
    throw new LocalizedError('HELP_INDEX_INVALID', 'helpFeedback.indexInvalid', {}, locale);
  const doc = value as HelpDocument;
  if (
    ['id', 'title', 'file', 'path', 'category', 'description'].some(
      (key) => typeof (value as Record<string, unknown>)[key] !== 'string',
    ) ||
    !/^[\w.-]+\.md$/.test(doc.file) ||
    !doc.id ||
    ![`help/${locale}`, 'releaseNotes'].includes(doc.path)
  ) {
    throw new LocalizedError('HELP_INDEX_INVALID', 'helpFeedback.indexInvalid', {}, locale);
  }
  const categoryId =
    doc.categoryId ??
    (doc.path === 'releaseNotes'
      ? 'release-notes'
      : doc.id.startsWith('book-details-')
        ? 'book-details'
        : 'guides');
  if (!['guides', 'book-details', 'release-notes'].includes(categoryId))
    throw new LocalizedError('HELP_INDEX_INVALID', 'helpFeedback.indexInvalid', {}, locale);
  return { ...doc, categoryId };
}
/** 页面与工具共用资源，服务层只使用显式语言，不读取全局界面状态。 */
export class HelpService {
  static async getIndex(locale: AppLocale): Promise<HelpDocument[]> {
    try {
      const response = await axios.get<unknown>(getAssetUrl(`help/${locale}/index.json`), {
        timeout: 10000,
      });
      if (!Array.isArray(response.data))
        throw new LocalizedError('HELP_INDEX_INVALID', 'helpFeedback.indexInvalid', {}, locale);
      const documents = response.data.map((value) => normalizeDocument(value, locale));
      if (new Set(documents.map((doc) => doc.id)).size !== documents.length)
        throw new LocalizedError('HELP_INDEX_INVALID', 'helpFeedback.indexInvalid', {}, locale);
      return documents;
    } catch (error) {
      if (error instanceof LocalizedError) throw error;
      throw new LocalizedError(
        'HELP_INDEX_LOAD_FAILED',
        'helpFeedback.indexFailed',
        { detail: getErrorMessage(error) },
        locale,
      );
    }
  }
  static async getDocument(id: string, locale: AppLocale): Promise<HelpContent> {
    const doc = (await this.getIndex(locale)).find((entry) => entry.id === id);
    if (!doc)
      throw new LocalizedError('HELP_DOCUMENT_NOT_FOUND', 'helpFeedback.notFound', { id }, locale);
    try {
      const path = doc.path === 'releaseNotes' ? doc.path : `help/${locale}`;
      const response = await axios.get<unknown>(getAssetUrl(`${path}/${doc.file}`), {
        timeout: 10000,
        responseType: 'text',
      });
      if (typeof response.data !== 'string' || !response.data.trim())
        throw new Error(translateText(locale, 'helpFeedback.emptyContent'));
      const markdown = response.data;
      const headings = marked
        .lexer(markdown)
        .filter((token): token is Tokens.Heading => token.type === 'heading')
        .map((token) => parseHelpHeading(token.text, token.depth));
      return { doc, markdown, headings };
    } catch (error) {
      throw new LocalizedError(
        'HELP_DOCUMENT_LOAD_FAILED',
        'helpFeedback.documentFailed',
        { title: doc.title, detail: getErrorMessage(error) },
        locale,
      );
    }
  }
}
