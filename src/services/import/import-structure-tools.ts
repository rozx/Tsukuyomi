import { describeImportTool } from 'src/services/ai/tools/tool-localization';
import type { AITool } from 'src/services/ai/types/ai-service';
import { importPatternSchema } from './import-pattern-schema';

export const importStructureSchema = {
  type: 'object' as const,
  properties: {
    resource_id: {
      type: 'string',
      description: describeImportTool('preview_text_structure.parameters.properties.resource_id'),
    },
    base_draft_revision: { type: 'integer', minimum: 0 },
    volume_id: {
      type: 'string',
      description: describeImportTool('preview_text_structure.parameters.properties.volume_id'),
    },
    replace_chapter_ids: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: { type: 'string' },
      description: describeImportTool(
        'preview_text_structure.parameters.properties.replace_chapter_ids',
      ),
    },
    rules: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['single', 'regex', 'markdown'] },
        chapter_pattern: importPatternSchema,
        volume_pattern: importPatternSchema,
        chapter_level: { type: 'integer', minimum: 1, maximum: 6 },
        volume_level: { type: 'integer', minimum: 1, maximum: 5 },
        include_headings: {
          type: 'boolean',
          description: describeImportTool(
            'preview_text_structure.parameters.properties.rules.properties.include_headings',
          ),
        },
        selection: {
          type: 'object',
          properties: {
            start: importPatternSchema,
            end: importPatternSchema,
            body: importPatternSchema,
          },
          description: describeImportTool(
            'preview_text_structure.parameters.properties.rules.properties.selection',
          ),
        },
      },
      required: ['mode'],
    },
  },
  required: ['resource_id', 'base_draft_revision', 'rules'],
};
export const importStructureTools: AITool[] = [
  {
    type: 'function',
    function: {
      name: 'preview_text_structure',
      description: describeImportTool('preview_text_structure'),
      parameters: importStructureSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_text_structure',
      description: describeImportTool('get_text_structure'),
      parameters: {
        type: 'object',
        properties: {
          batch_id: { type: 'string' },
          view: { type: 'string', enum: ['chapters', 'excluded'] },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        required: ['batch_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_text_structure',
      description: describeImportTool('apply_text_structure'),
      parameters: {
        type: 'object',
        properties: { batch_id: { type: 'string' } },
        required: ['batch_id'],
      },
    },
  },
];
