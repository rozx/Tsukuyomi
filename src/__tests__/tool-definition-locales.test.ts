import { describe, expect, it } from 'vitest';
import './setup';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import type { AITool } from '../services/ai/types/ai-service';
import type { ToolDefinition } from '../services/ai/tools/types';
import { localizeToolDefinition } from '../services/ai/tools/tool-localization';
import { importTools } from '../services/import/import-tool-definitions';
import { chapterTranslationFixture, translationChapter } from './chapter-translation-fixture';
type Schema = {
  description: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
};
function schema(tool: AITool) {
  return tool.function.parameters as unknown as Schema;
}

function protocol(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(protocol);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => key !== 'description' || typeof item !== 'string')
        .map(([key, item]) => [key, protocol(item)]),
    );
  return value;
}
describe('工具声明的执行语言与不可变协议', () => {
  it('导入工具独立描述不借用同名普通工具，语言变化不扩大权限', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
      const tools = importTools.map((tool) =>
        localizeToolDefinition(tool, locale, 'aiImportTools'),
      );
      expect(protocol(tools)).toEqual(protocol(importTools));
      expect(tools.some((tool) => tool.function.name === 'apply_import')).toBe(false);
      const bookInfo = tools.find((tool) => tool.function.name === 'get_book_info')!;
      if (locale === 'en-US') {
        expect(bookInfo.function.description).toContain('credentials');
        expect(
          tools.find((tool) => tool.function.name === 'preview_import')!.function.description,
        ).toContain('does not apply');
      }
    }
  });
  it('并发语言声明不互相覆盖，嵌套参数本地化且协议不变', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const cn = ToolRegistry.getTerminologyTools('fixture-book', 'zh-CN');
    const en = ToolRegistry.getTerminologyTools('fixture-book', 'en-US');
    const tw = ToolRegistry.getTerminologyTools('fixture-book', 'zh-TW');
    expect(protocol(en)).toEqual(protocol(cn));
    expect(protocol(tw)).toEqual(protocol(cn));
    expect(en[0]!.function.description).toContain('Create a terminology record');
    expect(tw[0]!.function.description).toContain('建立術語');
    expect(schema(en[0]!).properties!.name!.description).toContain('source');
    expect(en[0]!.function.description).not.toContain('创建');
    expect(cn[0]!.function.description).toContain('创建');
    expect(() => {
      en[0]!.function.description = 'changed';
    }).toThrow();
    expect(() => {
      schema(en[0]!).properties!.name!.description = 'changed';
    }).toThrow();
    expect(cn[0]!.function.description).toContain('创建');
  });
  it('原文前缀开关和嵌套 required 列表在三语言保持相同', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    for (const enabled of [false, true]) {
      const cn = ToolRegistry.getTranslationTools(
        'fixture-book',
        { enableOriginalTextValidation: enabled },
        'zh-CN',
      );
      const en = ToolRegistry.getTranslationTools(
        'fixture-book',
        { enableOriginalTextValidation: enabled },
        'en-US',
      );
      expect(protocol(en)).toEqual(protocol(cn));
      const batch = en.find((tool) => tool.function.name === 'add_translation_batch')!;
      const items = schema(batch).properties!.paragraphs!.items!;
      expect(items.required!.includes('original_text_prefix')).toBe(enabled);
      expect(items.properties!.original_text_prefix!.description).toContain(
        enabled ? 'anchor' : 'disabled',
      );
    }
  });
  it('注册全集的每个描述路径都有三语言版本，协议和冻结属性保持一致', () => {
    const definitions = (
      ToolRegistry as unknown as { getAllToolDefinitions(): ToolDefinition[] }
    ).getAllToolDefinitions();
    expect(definitions).toHaveLength(58);
    for (const { definition } of definitions) {
      for (const locale of ['zh-CN', 'zh-TW', 'en-US'] as const) {
        const localized = localizeToolDefinition(definition, locale);
        expect(protocol(localized)).toEqual(protocol(definition));
        expect(Object.isFrozen(localized.function)).toBe(true);
        expect(localized.function.description.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
