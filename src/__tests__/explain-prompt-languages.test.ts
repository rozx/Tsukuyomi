import { describe, expect, it } from 'vitest';
import './setup';
import { ExplainService } from '../services/ai/tasks/explain-service';
import { translateText } from '../i18n/translate';
import { APP_LOCALES } from '../models/locale';

describe('解释输入语言', () => {
  for (const locale of APP_LOCALES) {
    it(`${locale} 使用界面语言并原样携带任意语言文本`, () => {
      const source = 'مرحبا Привет สวัสดี {name} @link';
      const prompt = ExplainService.generatePrompt(source, locale);
      expect(prompt).toBe(translateText(locale, 'aiTasks.explain', { text: source }));
      expect(prompt).toContain(source);
      expect(prompt).not.toMatch(/以下日文|以下日語/);
    });
  }
});
