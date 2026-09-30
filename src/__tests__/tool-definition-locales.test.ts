import { describe, expect, it } from 'vitest';
import './setup';
import { ToolRegistry } from '../services/ai/tools/tool-registry';
import type { AITool } from '../services/ai/types/ai-service';
import type { ToolDefinition } from '../services/ai/tools/types';
import { finalizeToolDefinition } from '../services/ai/tools/tool-localization';
import { getImportTools, importTools } from '../services/import/import-tool-definitions';
import { agentText } from '../i18n/translate';
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
describe('工具声明为简中单源且协议不可变', () => {
  it('导入工具独立描述不借用同名普通工具，不扩大权限', () => {
    const tools = getImportTools();
    expect(protocol(tools)).toEqual(protocol(importTools));
    expect(tools.some((tool) => tool.function.name === 'apply_import')).toBe(false);
    const bookInfo = tools.find((tool) => tool.function.name === 'get_book_info')!;
    expect(bookInfo.function.description).toBe(agentText('aiImportTools.get_book_info'));
    expect(bookInfo.function.description).not.toBe(agentText('aiTools.get_book_info'));
  });
  it('返回冻结定义，调用方无法修改共享说明', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    const tools = ToolRegistry.getTerminologyTools('fixture-book');
    expect(tools[0]!.function.description).toContain('创建术语');
    expect(schema(tools[0]!).properties!.name!.description.length).toBeGreaterThan(0);
    expect(() => {
      tools[0]!.function.description = 'changed';
    }).toThrow();
    expect(() => {
      schema(tools[0]!).properties!.name!.description = 'changed';
    }).toThrow();
    expect(ToolRegistry.getTerminologyTools('fixture-book')[0]!.function.description).toContain(
      '创建术语',
    );
  });
  it('原文前缀开关切换说明，嵌套 required 列表保持', async () => {
    await chapterTranslationFixture([translationChapter('c', '11111111')]);
    for (const enabled of [false, true]) {
      const tools = ToolRegistry.getTranslationTools('fixture-book', {
        enableOriginalTextValidation: enabled,
      });
      const batch = tools.find((tool) => tool.function.name === 'add_translation_batch')!;
      const items = schema(batch).properties!.paragraphs!.items!;
      expect(items.required!.includes('original_text_prefix')).toBe(enabled);
      const key = enabled ? 'enabled' : 'disabled';
      expect(items.properties!.original_text_prefix!.description).toBe(
        agentText(
          `aiTools.add_translation_batch__parameters__properties__paragraphs__items__properties__original_text_prefix__${key}`,
        ),
      );
    }
  });
  it('注册全集的每个描述路径都有简中说明，协议和冻结属性保持一致', () => {
    const definitions = (
      ToolRegistry as unknown as { getAllToolDefinitions(): ToolDefinition[] }
    ).getAllToolDefinitions();
    expect(definitions).toHaveLength(58);
    for (const { definition } of definitions) {
      const finalized = finalizeToolDefinition(definition);
      expect(protocol(finalized)).toEqual(protocol(definition));
      expect(Object.isFrozen(finalized.function)).toBe(true);
      expect(finalized.function.description.trim().length).toBeGreaterThan(0);
    }
  });
});
