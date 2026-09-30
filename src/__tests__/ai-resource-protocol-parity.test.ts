import { describe, expect, it } from 'vitest';
import './setup';
import messages from '../i18n';
import { APP_LOCALES } from '../models/locale';

/**
 * 文案中的协议标记：工具名/字段名（snake_case 与 camelCase）、大写代码与数字。
 * URL、HTML 在各语言里是普通名词（中文可写作「网址」「网页」），不作为协议标记。
 */
const PLAIN_WORDS = new Set(['URL', 'HTML']);
function tokens(text: string): string[] {
  const found =
    text.match(
      /\b[a-z]+(?:_[a-z0-9]+)+\b|\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[A-Z][A-Z0-9_-]{2,}\b|\d+/g,
    ) ?? [];
  return [...new Set(found)].filter((token) => !PLAIN_WORDS.has(token)).sort();
}

function leaves(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value };
  if (!value || typeof value !== 'object') return {};
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, item]) => leaves(item, path ? `${path}.${key}` : key)),
  );
}

/** 只给模型阅读的整份资源：简中单源，不提供繁中/英文版本。 */
const AGENT_ONLY_CATALOGS = [
  'aiContext',
  'aiText',
  'aiState',
  'aiTasks',
  'aiValidation',
  'aiTodo',
  'aiTools',
  'aiImportTools',
  'aiBatchFeedback',
  'aiParagraphFeedback',
  'aiWebFeedback',
] as const;

/** 英文人格按 ai-assistant-persona 规定为中性表达，与简繁月詠人格刻意不同。 */
const EXEMPT = new Set(['aiAssistant.personaNeutral']);

describe('AI 文字按阅读者划分语言', () => {
  it('模型专用资源只存在于简中', () => {
    for (const catalog of AGENT_ONLY_CATALOGS) {
      expect(messages['zh-CN'], catalog).toHaveProperty(catalog);
      expect(messages['en-US'], catalog).not.toHaveProperty(catalog);
      expect(messages['zh-TW'], catalog).not.toHaveProperty(catalog);
    }
  });

  it('三语齐全的 AI 用户文案引用相同的工具、字段、代码与数值', () => {
    const catalogs = Object.keys(messages['zh-CN']).filter((name) => name.startsWith('ai'));
    const diffs: string[] = [];
    for (const catalog of catalogs) {
      const byLocale = Object.fromEntries(
        APP_LOCALES.map((locale) => [
          locale,
          leaves((messages[locale] as Record<string, unknown>)[catalog]),
        ]),
      ) as Record<(typeof APP_LOCALES)[number], Record<string, string>>;
      for (const [key, text] of Object.entries(byLocale['zh-CN'])) {
        const path = `${catalog}.${key}`;
        if (EXEMPT.has(path) || APP_LOCALES.some((locale) => !(key in byLocale[locale]))) continue;
        const expected = tokens(text);
        for (const locale of APP_LOCALES) {
          const actual = tokens(byLocale[locale][key]!);
          if (JSON.stringify(actual) !== JSON.stringify(expected))
            diffs.push(`${locale} ${path}: ${JSON.stringify({ expected, actual })}`);
        }
      }
    }
    expect(diffs).toEqual([]);
  });
});
