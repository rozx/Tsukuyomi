import type { AITool } from 'src/services/ai/types/ai-service';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import messages from 'src/i18n';
import { translateText } from 'src/i18n/translate';
import { TRANSLATION_BATCH_LIMITS } from 'src/services/ai/constants';

const PREFIX_PATH =
  'add_translation_batch.parameters.properties.paragraphs.items.properties.original_text_prefix';

/** 所有描述必须有对应资源，缺失时拒绝而不是借用另一语言。 */
type DescriptionCatalog = 'aiTools' | 'aiImportTools';
export function singleIdToolParameters(
  name: string,
  idField: string,
): AITool['function']['parameters'] {
  return {
    type: 'object',
    properties: { [idField]: stringToolParameter(name + '.parameters.properties.' + idField) },
    required: [idField],
  };
}

function toolDescription(path: string, locale: AppLocale, catalogName: DescriptionCatalog): string {
  const key = path.replaceAll('.', '__');
  const catalog = messages[locale][catalogName] as Record<string, string>;
  if (typeof catalog[key] !== 'string') throw new Error('MISSING_TOOL_DESCRIPTION: ' + path);
  return translateText(locale, (catalogName + '.' + key) as MessageKey, {
    max: TRANSLATION_BATCH_LIMITS.normal,
    tolerance: TRANSLATION_BATCH_LIMITS.withTolerance,
    doubleMax: TRANSLATION_BATCH_LIMITS.remaining,
  });
}

export function describeTool(path: string, locale: AppLocale = 'zh-CN'): string {
  return toolDescription(path, locale, 'aiTools');
}

/** 普通工具共用的字符串参数声明。 */
export function stringToolParameter(path: string): { type: 'string'; description: string } {
  return { type: 'string', description: describeTool(path) };
}

/** 复用普通工具的元信息与对象参数外壳。 */
export function toolDefinition(name: string, parameters: AITool['function']['parameters']): AITool {
  return {
    type: 'function',
    function: {
      name,
      description: describeTool(name),
      parameters,
    },
  };
}

export function describeImportTool(path: string, locale: AppLocale = 'zh-CN'): string {
  return toolDescription(path, locale, 'aiImportTools');
}

/** 只替换自然语言描述；协议字段原样克隆，递归冻结本次执行的定义。 */
export function localizeToolDefinition(
  tool: AITool,
  locale: AppLocale,
  catalogName: DescriptionCatalog = 'aiTools',
): AITool {
  const params = tool.function.parameters as unknown as {
    properties?: { paragraphs?: { items?: { required?: string[] } } };
  };
  const prefixEnabled =
    params.properties?.paragraphs?.items?.required?.includes('original_text_prefix') ?? false;
  const clone = (value: unknown, path: string[]): unknown => {
    if (Array.isArray(value))
      return Object.freeze(value.map((item, index) => clone(item, [...path, String(index)])));
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value).map(([key, item]) => {
      if (key === 'description' && typeof item === 'string') {
        let descriptionPath = path.join('.');
        if (descriptionPath === PREFIX_PATH)
          descriptionPath += prefixEnabled ? '.enabled' : '.disabled';
        return [key, toolDescription(descriptionPath, locale, catalogName)];
      }
      return [key, clone(item, [...path, key])];
    });
    return Object.freeze(Object.fromEntries(entries));
  };
  return Object.freeze({
    type: tool.type,
    function: clone(tool.function, [tool.function.name]),
  }) as AITool;
}
