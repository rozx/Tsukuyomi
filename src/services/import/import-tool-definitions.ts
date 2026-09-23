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
  },
  required: ['kind'],
  description:
    'extraction 引用已保存提取结果（可选块范围、块内 start/end）；existing 必须给出当前目标的 bookId、bookRevision、chapterId、paragraphId。',
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
        enum: ['title', 'author', 'description', 'cover', 'alternateTitles'],
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

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): AITool {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

export const importTools: AITool[] = [
  tool('list_sources', '列出当前任务来源及状态；不读取正文。', {
    parent_source_id: string,
    status: {
      type: 'string',
      enum: ['registered', 'inspected', 'extracted', 'failed', 'excluded'],
    },
    cursor: string,
    limit: paging.limit,
  }),
  tool(
    'inspect_source',
    '显式检查一个来源的结构、元信息和资源引用；不自动追加或跟随链接。',
    { source_id: string, refresh: boolean, encoding: string, ...paging },
    ['source_id'],
  ),
  tool(
    'read_source',
    '分页读取保存的快照或提取结果。blocks 返回稳定块 ID 与预览；text 可继续读取完整文本，excluded 检查排除记录，inspection 检查元信息。',
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
    '只追加已观察到的发现引用；保留父来源及用途，不抓取内容。',
    { discovery_ids: { type: 'array', items: string, minItems: 1, maxItems: 16 } },
    ['discovery_ids'],
  ),
  tool(
    'extract_novel_info',
    '检查小说元信息、目录资源和后续发现引用；不会获取目录外章节正文。',
    { source_id: string, snapshot_id: string, ...paging },
    ['source_id'],
  ),
  tool(
    'extract_content',
    '按明确来源及规则提取原文，保存完整结果并返回内容引用；每批最多八项，不改写正文。',
    {
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
  tool(
    'get_import_draft',
    '读取当前草稿版本、目标与必要问题。chapters 分页列出章节概要；chapter 按 chapter_id 分页读取该章内容引用。',
    {
      view: { type: 'string', enum: ['overview', 'chapters', 'chapter'] },
      chapter_id: string,
      ...paging,
    },
  ),
  tool(
    'edit_import_draft',
    '按版本原子编辑草稿。先声明小说候选及来源归属，再建卷章；sourceIds 可传空数组由宿主从引用计算。只能引用原文；不能伪造确认或写入书库。',
    { base_draft_revision: number, operations },
    ['base_draft_revision', 'operations'],
  ),
  tool('search_books', '按书名、作者或来源线索搜索本地小说，只返回候选及依据。', {
    query: string,
    author: string,
    url: string,
    ...paging,
  }),
  tool(
    'get_book_info',
    '读取明确小说 ID 的基本信息，不附带模型配置、凭据或记忆。',
    { book_id: string },
    ['book_id'],
  ),
  tool('list_chapters', '按明确小说 ID 分页读取卷章结构。', { book_id: string, ...paging }, [
    'book_id',
  ]),
  tool(
    'get_chapter_info',
    '按明确小说和章节 ID 分页读取原文及对应引用所需修改序号。',
    { book_id: string, chapter_id: string, ...paging },
    ['book_id', 'chapter_id'],
  ),
  tool(
    'search_web',
    '仅搜索作者、简介、封面、别名等元信息；结果保持 metadata-only，不能作为替代正文。',
    { query: string },
    ['query'],
  ),
  tool(
    'rename_import_task',
    '为当前导入任务命名，便于用户在任务列表中区分。识别出书名等书本信息后必须调用；通常用书名，可附作者或范围。用户手动命名后不能修改。',
    { name: string },
    ['name'],
  ),
  tool(
    'preview_import',
    '根据当前草稿版本生成真实差异与译文影响，保存待用户检查的方案；不会应用。',
    { draft_revision: number },
    ['draft_revision'],
  ),
  // 问答与待办复用普通助手的参数约定；导入执行中提问会保存问题并暂停，由用户在工作台回答后恢复
  ...askUserTools.map(({ definition }) => ({
    ...definition,
    function: {
      ...definition.function,
      description:
        definition.function.name === 'ask_user'
          ? '向用户提出一个必要问题。导入执行会保存问题并暂停，用户在导入工作台回答后恢复，并返回回答。只用于无法从来源判断的关键歧义。'
          : '一次向用户提出多个必要问题。导入执行会保存问题并暂停，用户须回答全部问题后才会恢复。',
    },
  })),
  ...todoListTools
    .map(({ definition }) => definition)
    .filter((definition) =>
      (IMPORT_TODO_TOOLS as readonly string[]).includes(definition.function.name),
    ),
];
