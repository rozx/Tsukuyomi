import { describeImportTool } from 'src/services/ai/tools/tool-localization';
export const importPatternSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['literal', 'regex'] },
    pattern: {
      type: 'string',
      description: describeImportTool(
        'preview_text_structure.parameters.properties.rules.properties.chapter_pattern.properties.pattern',
      ),
    },
    flags: {
      type: 'string',
      description: describeImportTool(
        'preview_text_structure.parameters.properties.rules.properties.chapter_pattern.properties.flags',
      ),
    },
  },
  required: ['mode', 'pattern'],
};

export const importSourceFilterSchema = {
  type: 'object',
  properties: { name: importPatternSchema, locator: importPatternSchema },
  description: describeImportTool('prepare_chapter_batch.parameters.properties.filter'),
};
