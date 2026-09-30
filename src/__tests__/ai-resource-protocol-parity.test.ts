import { describe, expect, it } from 'vitest';
import './setup';
import messages from '../i18n';
import { APP_LOCALES } from '../models/locale';

type Prompt = { rules: Record<string, string> } & Record<string, unknown>;

/**
 * 规则中的协议标记：工具名/字段名（snake_case 与 camelCase）、大写代码与数字。
 * URL 在各语言里是普通名词（中文可写作「网址」「地址」），不作为协议标记。
 */
const PLAIN_WORDS = new Set(['URL']);
function tokens(text: string): string[] {
  const found =
    text.match(
      /\b[a-z]+(?:_[a-z0-9]+)+\b|\b[a-z]+(?:[A-Z][a-z0-9]*)+\b|\b[A-Z][A-Z0-9_-]{2,}\b|\d+/g,
    ) ?? [];
  return [...new Set(found)].filter((token) => !PLAIN_WORDS.has(token)).sort();
}

describe('导入 Agent 规则三语言等价', () => {
  it('每条规则引用相同的工具、字段、代码与数值', () => {
    const reference = messages['zh-CN'].aiImportPrompt as unknown as Prompt;
    const keys = Object.keys(reference.rules);
    expect(keys).toHaveLength(16);
    const diffs: string[] = [];
    for (const locale of APP_LOCALES) {
      const prompt = messages[locale].aiImportPrompt as unknown as Prompt;
      expect(Object.keys(prompt.rules)).toEqual(keys);
      for (const key of keys) {
        const expected = tokens(reference.rules[key]!);
        const actual = tokens(prompt.rules[key]!);
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          diffs.push(`${locale} rule ${key}: ${JSON.stringify({ expected, actual })}`);
      }
    }
    expect(diffs).toEqual([]);
  });
});

function leaves(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value };
  if (!value || typeof value !== 'object') return {};
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, item]) => leaves(item, path ? `${path}.${key}` : key)),
  );
}

/** 英文人格按 ai-assistant-persona 规定为中性表达，与简繁月詠人格刻意不同。 */
const EXEMPT = new Set(['aiAssistant.persona']);

describe('AI 提示词与工具说明三语言等价', () => {
  for (const catalog of [
    'aiImportPrompt',
    'aiImportTools',
    'aiTools',
    'aiText',
    'aiState',
    'aiWorkflow',
    'aiContext',
    'aiAssistant',
    'aiTodo',
    'aiTasks',
  ] as const) {
    it(`${catalog} 每个条目的协议标记一致`, () => {
      const reference = leaves(messages['zh-CN'][catalog]);
      const diffs: string[] = [];
      for (const locale of APP_LOCALES) {
        const current = leaves(messages[locale][catalog]);
        expect(Object.keys(current).sort()).toEqual(Object.keys(reference).sort());
        for (const [key, text] of Object.entries(reference)) {
          if (EXEMPT.has(`${catalog}.${key}`)) continue;
          const expected = tokens(text);
          const actual = tokens(current[key]!);
          if (JSON.stringify(actual) !== JSON.stringify(expected))
            diffs.push(`${locale} ${key}: ${JSON.stringify({ expected, actual })}`);
        }
      }
      expect(diffs).toEqual([]);
    });
  }
});
