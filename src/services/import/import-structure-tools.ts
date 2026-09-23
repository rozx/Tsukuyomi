import type { AITool } from 'src/services/ai/types/ai-service';
import { importPatternSchema } from './import-pattern-schema';

export const importStructureSchema = {
  type: 'object' as const,
  properties: {
    resource_id: {
      type: 'string',
      description:
        '已保存 TXT／Markdown 的 extraction contentId，不接受快照 ID。坐标相对其拼接文本。',
    },
    base_draft_revision: { type: 'integer', minimum: 0 },
    volume_id: {
      type: 'string',
      description: '未匹配卷标题的内容放入此已有卷；省略时创建未分卷。',
    },
    replace_chapter_ids: {
      type: 'array',
      minItems: 1,
      maxItems: 500,
      items: { type: 'string' },
      description: '明确替换该文件的已有草稿章；其他章保持不变。重叠时必须提供。',
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
          description: '是否在正文保留章标题，默认 false；卷标题始终提取到卷名。',
        },
        selection: {
          type: 'object',
          properties: {
            start: importPatternSchema,
            end: importPatternSchema,
            body: importPatternSchema,
          },
          description:
            '可省略表示全部。start/end 各须唯一命中，保留两标记之间的正文（不含标记）；body 与起止标记互斥，须唯一命中并有命名 body 捕获组。',
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
      description:
        '预览 TXT／Markdown 的正文范围与批量拆卷拆章，保存方案但不修改草稿。每批最多 500 章（含待归类内容）。regex 用独立整行标题模式，命名 title 组作标题；markdown 指定 chapter_level 和可选更浅的 volume_level，忽略代码内伪标题；single 将范围作一章。返回计数与五个示例，完整方案用 get_text_structure 分页查看。',
      parameters: importStructureSchema,
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_text_structure',
      description:
        '分页读取已保存的文本结构方案，查看卷章标题、字数、原文区间、首尾片段、警告或排除原因；不重新扫描。',
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
      description:
        '应用已预览的文本结构方案到草稿。原子创建或明确替换卷章；保留原文引用，不写书库。来源或草稿变化后须重新预览；同一方案重复应用不重做。',
      parameters: {
        type: 'object',
        properties: { batch_id: { type: 'string' } },
        required: ['batch_id'],
      },
    },
  },
];
