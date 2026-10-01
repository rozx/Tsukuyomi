import { describe, expect, it } from 'vitest';
import './setup';
import { ExplainService } from '../services/ai/tasks/explain-service';
import { agentText } from '../i18n/translate';
import { aiLanguageName } from '../services/ai/tasks/prompts/language';
import { APP_LOCALES } from '../models/locale';

describe('解释输入语言', () => {
  for (const locale of APP_LOCALES) {
    it(`${locale} 简中指令要求以界面语言回复，并原样携带任意语言文本`, () => {
      const source = 'مرحبا Привет สวัสดี {name} @link';
      const prompt = ExplainService.generatePrompt(source, locale);
      expect(prompt).toBe(
        agentText('aiTasks.explain', { text: source, dialogLanguage: aiLanguageName(locale) }),
      );
      expect(prompt).toContain(aiLanguageName(locale));
      expect(prompt).toContain(source);
      expect(prompt).not.toMatch(/以下日文|以下日語/);
    });
  }
});
