import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axios from 'axios';
import { HelpService } from '../services/help-service';
import { helpDocsTools } from '../services/ai/tools/help-docs-tools';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { AppLocale } from '../models/locale';
import type { HelpDocument } from '../models/help';
const originalIndex = JSON.parse(readFileSync('public/help/index.json', 'utf8')) as HelpDocument[];
const guides = originalIndex.filter((doc) => doc.path !== 'releaseNotes');
afterEach(() => vi.restoreAllMocks());
function resources() {
  vi.spyOn(axios, 'get').mockImplementation((url) => {
    const path = new URL(String(url), 'http://localhost').pathname.replace(/^\//, '');
    const file = readFileSync(resolve('public', path), 'utf8');
    return Promise.resolve({ data: path.endsWith('.json') ? JSON.parse(file) : file });
  });
}
describe('真实三语帮助集合', () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as AppLocale[]) {
    it(`${locale}全部16篇同源全文与章节身份，AI读取不截断`, async () => {
      resources();
      expect(guides).toHaveLength(16);
      const index = await HelpService.getIndex(locale);
      expect(index.map((d) => d.id)).toEqual(originalIndex.map((d) => d.id));
      for (const doc of guides) {
        const resource = await HelpService.getDocument(doc.id, locale);
        const folder = locale === 'zh-CN' ? 'help' : `help/${locale}`;
        expect(resource.markdown).toBe(readFileSync(`public/${folder}/${doc.file}`, 'utf8'));
        const cn = await HelpService.getDocument(doc.id, 'zh-CN');
        expect(resource.headings.map((h) => h.id)).toEqual(cn.headings.map((h) => h.id));
        const result = JSON.parse(
          await helpDocsTools
            .find((t) => t.definition.function.name === 'get_help_doc')!
            .handler({ doc_id: doc.id }, { languages: captureExecutionLanguages(locale) }),
        );
        expect(result.data.content).toBe(resource.markdown);
        expect(result.data.sections).toEqual(resource.headings);
      }
    });
  }
  for (const [locale, query, id] of [
    ['en-US', 'target language', 'front-page'],
    ['zh-TW', '設定', 'settings-guide'],
  ] as const) {
    it(`${locale}真实索引关键词可查询`, async () => {
      resources();
      const result = JSON.parse(
        await helpDocsTools
          .find((t) => t.definition.function.name === 'search_help_docs')!
          .handler({ query }, { languages: captureExecutionLanguages(locale) }),
      );
      expect(result.data.docs.some((doc: HelpDocument) => doc.id === id)).toBe(true);
    });
  }
});
