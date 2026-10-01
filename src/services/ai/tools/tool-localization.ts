import type { AITool } from 'src/services/ai/types/ai-service';
import type { AgentMessageKey } from 'src/i18n/types';
import messages from 'src/i18n';
import { agentText } from 'src/i18n/translate';
import { TRANSLATION_BATCH_LIMITS } from 'src/services/ai/constants';

const PREFIX_PATH =
  'add_translation_batch.parameters.properties.paragraphs.items.properties.original_text_prefix';

/** 工具说明只给模型阅读，保持简中单源；缺失资源时拒绝。 */
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

function toolDescription(path: string, catalogName: DescriptionCatalog): string {
  const key = path.replaceAll('.', '__');
  const catalog = messages['zh-CN'][catalogName] as Record<string, string>;
  if (typeof catalog[key] !== 'string') throw new Error('MISSING_TOOL_DESCRIPTION: ' + path);
  return agentText((catalogName + '.' + key) as AgentMessageKey, {
    max: TRANSLATION_BATCH_LIMITS.normal,
    tolerance: TRANSLATION_BATCH_LIMITS.withTolerance,
    doubleMax: TRANSLATION_BATCH_LIMITS.remaining,
  });
}

export function describeTool(path: string): string {
  return toolDescription(path, 'aiTools');
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

export function describeImportTool(path: string): string {
  return toolDescription(path, 'aiImportTools');
}

/** 按当前原文前缀开关选择说明；协议字段原样克隆，递归冻结，避免调用方修改共享定义。 */
export function finalizeToolDefinition(
  tool: AITool,
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
        return [key, toolDescription(descriptionPath, catalogName)];
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
