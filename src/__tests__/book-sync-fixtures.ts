import type { BookUpdateRecipe } from '../models/book-sync';
import type { Novel, Chapter, Paragraph } from '../models/novel';
import { LibraryPersistence } from '../services/library-persistence';
import { getDB } from '../utils/indexed-db';
export const syncRoot = 'https://example.com/book';
export const syncRecipe: BookUpdateRecipe = {
  version: 1,
  engine: { kind: 'html', content: { selector: 'article' } },
  catalogUrls: [syncRoot],
  verifiedChapterCount: 0,
  recordedAt: 1,
};
export const syncParagraph = (text = '旧正文', id = 'p'): Paragraph => ({
  id,
  text,
  selectedTranslationId: 't',
  translations: [{ id: 't', translation: '旧译文', aiModelId: 'm' }],
});
export const syncChapter = (n: number): Chapter => ({
  id: `c${n}`,
  title: `第${n}话`,
  webUrl: `https://example.com/${n}`,
  content: [syncParagraph()],
  createdAt: new Date(0),
  lastEdited: new Date(0),
});
export const syncBook = (count = 1): Novel => ({
  id: 'book',
  title: '本地书名',
  description: '本地简介',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  updateRecipe: structuredClone(syncRecipe),
  volumes: [
    {
      id: 'v',
      title: '本地卷',
      chapters: Array.from({ length: count }, (_, i) => syncChapter(i + 1)),
    },
  ],
});
export const syncSnapshot = (html: string, url: string) => ({
  html,
  requestUrl: url,
  transportUrl: url,
  status: 200,
  contentType: 'text/html',
});
export const syncCatalogHtml = (count: number) =>
  `<head><meta property="og:image" content="https://example.com/cover.jpg"></head><h1>远端书名</h1><nav>${Array.from({ length: count }, (_, i) => `<a href="/${i + 1}">第${i + 1}话</a>`).join('')}</nav>`;
export async function saveSyncBook(book = syncBook()) {
  await LibraryPersistence.saveBooks(await getDB(), [book]);
  return book;
}
