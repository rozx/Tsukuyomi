import {
  describeImportTool,
  finalizeToolDefinition,
} from 'src/services/ai/tools/tool-localization';
import { importStructureTools } from './import-structure-tools';

import { importPatternSchema, importSourceFilterSchema } from './import-pattern-schema';
import type { AITool } from 'src/services/ai/types/ai-service';
import { askUserTools } from 'src/services/ai/tools/ask-user-tools';
import { todoListTools } from 'src/services/ai/tools/todo-list-tools';
import { IMPORT_TODO_TOOLS } from './import-todos';

const string = { type: 'string' };
const strings = { type: 'array', items: string };
const number = { type: 'integer', minimum: 0 };
const boolean = { type: 'boolean' };
const paging = { offset: number, limit: { type: 'integer', minimum: 1, maximum: 100 } };
const reference = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['extraction', 'existing'] },
    resourceId: string,
    blockId: string,
    endBlockId: string,
    start: number,
    end: number,
    bookId: string,
    bookRevision: number,
    chapterId: string,
    paragraphId: string,
    excludeRanges: {
      type: 'array',
      maxItems: 10000,
      items: {
        type: 'object',
        properties: { start: number, end: number },
        required: ['start', 'end'],
      },
      description: describeImportTool(
        'edit_import_draft.parameters.properties.operations.items.properties.candidates.items.properties.content.items.properties.excludeRanges',
      ),
    },
  },
  required: ['kind'],
  description: describeImportTool(
    'edit_import_draft.parameters.properties.operations.items.properties.candidates.items.properties.content.items',
  ),
};
const references = { type: 'array', items: reference };
const rules = {
  type: 'object',
  properties: {
    preset: string,
    selector: string,
    excludeSelectors: strings,
    encoding: string,
    ranges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { start: number, end: number },
        required: ['start', 'end'],
      },
    },
    excludeRanges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { start: number, end: number, reason: string },
        required: ['start', 'end', 'reason'],
      },
    },
  },
};
const operations = {
  type: 'array',
  minItems: 1,
  maxItems: 128,
  items: {
    type: 'object',
    properties: {
      op: {
        type: 'string',
        enum: [
          'set_metadata',
          'propose_target',
          'declare_candidates',
          'upsert_volume',
          'upsert_chapter',
          'remove_chapter',
          'reorder_chapters',
          'reorder_volumes',
          'propose_match',
          'set_completeness',
        ],
      },
      field: {
        type: 'string',
        enum: ['title', 'author', 'description', 'cover', 'alternateTitles', 'tags'],
      },
      value: string,
      sourceId: string,
      resourceId: string,
      bookId: { type: ['string', 'null'] },
      id: string,
      title: string,
      inferred: boolean,
      chapterId: string,
      chapterIds: strings,
      volumeIds: strings,
      targetChapterIds: strings,
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: string,
            title: string,
            author: string,
            sourceIds: strings,
            content: references,
          },
          required: ['id', 'title', 'sourceIds'],
        },
      },
      chapter: {
        type: 'object',
        properties: {
          id: string,
          volumeId: string,
          title: string,
          inferredTitle: boolean,
          inferredStructure: boolean,
          selected: boolean,
          content: references,
          sourceIds: strings,
          status: { type: 'string', enum: ['pending', 'ready', 'failed', 'missing'] },
        },
        required: [
          'id',
          'volumeId',
          'title',
          'inferredTitle',
          'inferredStructure',
          'selected',
          'content',
          'sourceIds',
          'status',
        ],
      },
      completeness: {
        type: 'object',
        properties: { confirmed: boolean, knownTotal: number, missing: strings },
        required: ['confirmed', 'missing'],
      },
    },
    required: ['op'],
  },
};

function tool(name: string, properties: Record<string, unknown>, required: string[] = []): AITool {
  return {
    type: 'function',
    function: {
      name,
      description: describeImportTool(name),
      parameters: { type: 'object', properties, required },
    },
  };
}

export function getImportTools(): AITool[] {
  return importTools.map((tool) => finalizeToolDefinition(tool, 'aiImportTools'));
}

export const importTools: AITool[] = [
  ...importStructureTools,
  tool(
    'preview_draft_batch',
    {
      base_draft_revision: number,
      target: { type: 'string', enum: ['body', 'chapter_title', 'volume_title'] },
      scope: {
        type: 'object',
        properties: {
          chapter_ids: { ...strings, minItems: 1, maxItems: 500 },
          volume_ids: { ...strings, minItems: 1, maxItems: 500 },
          selected_only: boolean,
          title: importPatternSchema,
        },
      },
      pattern: importPatternSchema,
      action: { type: 'string', enum: ['remove_matches', 'remove_lines', 'replace'] },
      replacement: {
        type: 'string',
        description: describeImportTool('preview_draft_batch.parameters.properties.replacement'),
      },
    },
    ['base_draft_revision', 'target', 'scope', 'pattern', 'action'],
  ),
  tool('apply_draft_batch', { batch_id: string }, ['batch_id']),
  tool(
    'run_chapter_batch',
    {
      batch_id: string,
      base_draft_revision: number,
      retry_failed: boolean,
    },
    ['batch_id', 'base_draft_revision'],
  ),
  tool(
    'get_chapter_batch',
    {
      batch_id: string,
      ...paging,
    },
    ['batch_id'],
  ),
  tool(
    'prepare_chapter_batch',
    {
      base_draft_revision: number,
      volume_id: string,
      filter: importSourceFilterSchema,
      source_ids: { type: 'array', items: string, minItems: 1, maxItems: 500 },
      discovery_ids: { type: 'array', items: string, minItems: 1, maxItems: 500 },
      catalog: {
        type: 'object',
        properties: {
          snapshot_id: string,
          offset: number,
          limit: { type: 'integer', minimum: 1, maximum: 500 },
        },
        required: ['snapshot_id', 'offset', 'limit'],
      },
      rules,
    },
    ['base_draft_revision', 'volume_id'],
  ),
  tool('list_sources', {
    parent_source_id: string,
    status: {
      type: 'string',
      enum: ['registered', 'inspected', 'extracted', 'failed', 'excluded'],
    },
    cursor: string,
    limit: paging.limit,
  }),
  tool('inspect_source', { source_id: string, refresh: boolean, encoding: string, ...paging }, [
    'source_id',
  ]),
  tool(
    'read_source',
    {
      resource_id: string,
      view: { type: 'string', enum: ['text', 'blocks', 'excluded', 'inspection'] },
      offset: number,
      limit: { type: 'integer', minimum: 1, maximum: 16000 },
    },
    ['resource_id'],
  ),
  tool(
    'add_sources',
    {
      discovery_ids: { type: 'array', items: string, minItems: 1, maxItems: 16 },
      filter: importSourceFilterSchema,
    },
    ['discovery_ids'],
  ),
  tool('extract_novel_info', { source_id: string, snapshot_id: string, ...paging }, ['source_id']),
  tool(
    'extract_content',
    {
      filter: importSourceFilterSchema,
      sources: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: { source_id: string, snapshot_id: string, rules },
          required: ['source_id'],
        },
      },
    },
    ['sources'],
  ),
  tool('get_import_draft', {
    view: { type: 'string', enum: ['overview', 'chapters', 'chapter'] },
    chapter_id: string,
    ...paging,
  }),
  tool('edit_import_draft', { base_draft_revision: number, operations }, [
    'base_draft_revision',
    'operations',
  ]),
  tool('search_books', {
    query: string,
    author: string,
    url: string,
    ...paging,
  }),
  tool('get_book_info', { book_id: string }, ['book_id']),
  tool('list_chapters', { book_id: string, ...paging }, ['book_id']),
  tool('get_chapter_info', { book_id: string, chapter_id: string, ...paging }, [
    'book_id',
    'chapter_id',
  ]),
  tool('search_web', { query: string }, ['query']),
  tool('rename_import_task', { name: string }, ['name']),
  tool(
    'record_update_recipe',
    {
      base_draft_revision: number,
      catalog_source_ids: { ...strings, minItems: 1, maxItems: 20 },
      catalog_selector: {
        type: 'string',
        description: describeImportTool(
          'record_update_recipe.parameters.properties.catalog_selector',
        ),
      },
      chapter_filter: importSourceFilterSchema,
      content_rules: {
        type: 'object',
        properties: { preset: string, selector: string, excludeSelectors: strings },
        description: describeImportTool('record_update_recipe.parameters.properties.content_rules'),
      },
      cleanup: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            pattern: importPatternSchema,
            action: { type: 'string', enum: ['remove_matches', 'remove_lines'] },
          },
          required: ['pattern', 'action'],
        },
        description: describeImportTool('record_update_recipe.parameters.properties.cleanup'),
      },
      strip_heading: {
        type: 'boolean',
        description: describeImportTool('record_update_recipe.parameters.properties.strip_heading'),
      },
      pinned_chapter_ids: {
        ...strings,
        maxItems: 500,
        description: describeImportTool(
          'record_update_recipe.parameters.properties.pinned_chapter_ids',
        ),
      },
    },
    ['base_draft_revision', 'catalog_source_ids'],
  ),
  tool('preview_import', { draft_revision: number }, ['draft_revision']),
  // 问答与待办复用普通助手的参数约定；导入执行中提问会保存问题并暂停，由用户在工作台回答后恢复
  ...askUserTools.map(({ definition }) => ({
    ...definition,
    function: {
      ...definition.function,
      description: describeImportTool(definition.function.name),
    },
  })),
  ...todoListTools
    .map(({ definition }) => definition)
    .filter((definition) =>
      (IMPORT_TODO_TOOLS as readonly string[]).includes(definition.function.name),
    ),
];
