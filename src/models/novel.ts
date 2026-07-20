import type { AIModel } from '../services/ai/types/ai-model';

// 小说
export interface Novel {
  id: string;
  title: string;
  alternateTitles?: string[] | undefined;
  author?: string | undefined;
  description?: string | undefined;
  cover?: CoverImage | undefined;
  tags?: string[] | undefined;
  volumes?: Volume[] | undefined;
  webUrl?: string[] | undefined;
  starred?: boolean | undefined;
  lastEdited: Date;
  createdAt: Date;
  defaultAIModel?:
    | {
        translation: AIModel;
        proofreading: AIModel;
        termsTranslation: AIModel;
        assistant: AIModel;
      }
    | undefined;
  characterSettings?: CharacterSetting[] | undefined;
  terminologies?: Terminology[] | undefined;
  notes?: Note[] | undefined;
  /**
   * 特殊指令（书籍级别）
   * - translationInstructions: 翻译任务的特殊指令
   * - polishInstructions: 润色任务的特殊指令
   * - proofreadingInstructions: 校对任务的特殊指令
   * 章节级别的指令会覆盖书籍级别的指令
   */
  translationInstructions?: string | undefined;
  polishInstructions?: string | undefined;
  proofreadingInstructions?: string | undefined;
  /**
   * 是否保留翻译中的行首空格（缩进）
   * - true: 保留行首空格
   * - false: 移除行首空格（过滤缩进）
   * - undefined: 默认保留行首空格
   * 章节级别的设置会覆盖书籍级别的设置
   */
  preserveIndents?: boolean | undefined;

  /**
   * 显示/导出时是否自动规范化译文符号（不写回译文）
   * - true: 显示与导出时规范化（引号、标点、空格等）
   * - false/undefined: 不规范化（默认）
   */
  normalizeSymbolsOnDisplay?: boolean | undefined;

  /**
   * 显示/导出时是否自动规范化章节标题（不写回标题）
   * - true: 显示与导出时规范化标题（如：将全角数字和汉字之间的半角空格转换为全角空格）
   * - false/undefined: 不规范化（默认）
   */
  normalizeTitleOnDisplay?: boolean | undefined;
  /**
   * 翻译相关任务的分块大小（字符数，近似 token 数）
   * - 用于翻译、润色、校对任务的分块处理
   * - undefined: 使用默认值 8000
   * - 此设置应用于整个书籍的所有章节
   */
  translationChunkSize?: number | undefined;

  /**
   * 是否跳过 AI 追问（ask_user）
   * - true: 翻译相关任务不提供 ask_user 工具，并在兜底情况下直接返回 cancelled（不弹出问答对话框）
   * - false/undefined: 默认行为（允许 ask_user）
   * - 此设置应用于整个书籍的所有章节
   */
  skipAskUser?: boolean | undefined;

  /**
   * 是否启用原文校验（original_text_prefix 校验）
   * - true: 启用原文前缀校验（AI 提交翻译时必须提供 original_text_prefix 且通过校验）
   * - false/undefined: 禁用校验（默认），AI 无需提供 original_text_prefix，减少 token 消耗
   * - 此设置应用于整个书籍的所有章节
   */
  enableOriginalTextValidation?: boolean | undefined;

  /**
   * 本书任务模型覆盖
   * - 键为任务类型（translation / proofreading，校对与润色共用），值为 AI 模型 ID
   * - null/undefined: 跟随全局默认模型
   * - 覆盖指向已删除/禁用的模型时运行时静默回退全局默认，不自动清理
   * - 此设置应用于整个书籍的所有章节
   */
  taskModelOverrides?:
    | {
        translation?: string | null;
        proofreading?: string | null;
      }
    | undefined;
}

export interface CoverImage {
  url: string;
  deleteUrl?: string | undefined;
}

export interface CoverHistoryItem extends CoverImage {
  id: string;
  addedAt: Date;
}

export interface Volume {
  id: string;
  title:
    | string
    | {
        original: string;
        translation: Translation;
      };
  description?: string | undefined;
  cover?: CoverImage | undefined;
  chapters?: Chapter[] | undefined;
}

export interface Chapter {
  id: string;
  title:
    | string
    | {
        original: string;
        translation: Translation;
      };
  webUrl?: string | undefined; // 网络地址

  /**
   * 章节内容（懒加载）
   * - 列表视图时为 undefined，节省内存
   * - 查看章节详情时才加载内容
   */
  content?: Paragraph[] | undefined;

  /**
   * 内容是否已加载（用于判断是否需要加载）
   * - true: 内容已加载（content 可能为空数组或有内容）
   * - false/undefined: 内容未加载
   */
  contentLoaded?: boolean | undefined;

  originalContent?: string | undefined; // 原始爬取的内容文本（保留原始格式）

  /**
   * 章节最后编辑时间（本地）
   * - 创建时：等于 createdAt
   * - 本地编辑时（如编辑标题、合并内容等）：更新为当前时间
   * - 从网站爬取新章节时：等于 createdAt（使用网站日期或当前时间）
   * - 合并已存在章节时：更新为当前时间（因为内容被更新）
   */
  lastEdited: Date;

  /**
   * 章节创建时间（本地）
   * - 创建时设置，之后保持不变
   * - 从网站爬取时：使用网站日期或当前时间
   * - 合并已存在章节时：保留原有的 createdAt
   */
  createdAt: Date;

  /**
   * 原文最后更新时间（从网站获取）
   * - 仅当网站明确提供 lastUpdated 时设置，否则保持为 undefined
   * - 用于判断网站是否有更新，决定是否预选章节进行导入
   * - 合并已存在章节时：如果新章节有 lastUpdated 则使用新的，否则保留原有的
   *
   * 预选逻辑（NovelScraperDialog）：
   * - 未导入的章节：自动预选
   * - 已导入的章节：
   *   - 如果远程 lastUpdated > 本地 lastUpdated：自动预选（网站有更新）
   *   - 如果远程 lastUpdated <= 本地 lastUpdated：不预选（本地已是最新）
   *   - 如果远程没有 lastUpdated：不预选（无法判断是否有更新）
   *   - 如果本地没有 lastUpdated 但远程有：自动预选（认为远程更新）
   */
  lastUpdated?: Date | undefined;

  /**
   * 特殊指令（章节级别，会覆盖书籍级别的指令）
   * - translationInstructions: 翻译任务的特殊指令
   * - polishInstructions: 润色任务的特殊指令
   * - proofreadingInstructions: 校对任务的特殊指令
   */
  translationInstructions?: string | undefined;
  polishInstructions?: string | undefined;
  proofreadingInstructions?: string | undefined;
  /**
   * 是否保留翻译中的行首空格（缩进）
   * - true: 保留行首空格
   * - false: 移除行首空格（过滤缩进）
   * - undefined: 默认保留行首空格
   * 章节级别的设置会覆盖书籍级别的设置
   */
  preserveIndents?: boolean | undefined;

  /**
   * 显示/导出时是否自动规范化译文符号（不写回译文）
   * - true: 显示与导出时规范化（引号、标点、空格等）
   * - false/undefined: 不规范化（默认）
   */
  normalizeSymbolsOnDisplay?: boolean | undefined;

  /**
   * 显示/导出时是否自动规范化章节标题（不写回标题）
   * - true: 显示与导出时规范化标题（如：将全角数字和汉字之间的半角空格转换为全角空格）
   * - false/undefined: 不规范化（默认）
   * 章节级别的设置会覆盖书籍级别的设置
   */
  normalizeTitleOnDisplay?: boolean | undefined;
}

export interface Paragraph {
  id: string;
  text: string;
  selectedTranslationId: string; // id of Translation
  translations: Translation[];
}

/**
 * 记忆打分详情
 * 记录注入记忆时每个信号的原始值、加权值与总分，用于 UI 的评分详情 tooltip
 */
export interface ScoreBreakdown {
  semantic: number; // 原始语义相似度 ∈ [0, 1]
  keyword: number; // 原始关键词命中比例 ∈ [0, 1]
  recency: number; // 原始时间衰减因子 ∈ [0, 1]
  semanticWeighted: number; // semantic × 权重
  keywordWeighted: number; // keyword × 权重
  recencyWeighted: number; // 保留兼容字段，相关性排序固定为 0
  total: number; // 语义与关键词的融合分
}

export interface Translation {
  id: string;
  translation: string;
  aiModelId: string; // id of AIModel
  referencedMemories?: string[]; // IDs of memories referenced during translation
  /**
   * 记忆打分详情（仅对由打分系统注入的记忆有效；AI 主动调用的不会有条目）
   * 非同步字段：Gist 序列化时会被 strip，不参与跨设备同步
   */
  memoryScoreBreakdown?: Record<string, ScoreBreakdown>;
}

export interface Note {
  id: string;
  text: string;
  aiResults: string[];
  defaultAIModelId: string; // id of AIModel
  lastEdited: Date;
  createdAt: Date;
  references: Chapter[];
}

// 术语
export interface Terminology {
  id: string;
  name: string;
  description?: string | undefined;
  translation: Translation;
}

// 角色设定
export interface CharacterSetting {
  id: string;
  name: string;
  sex: 'male' | 'female' | 'other' | undefined;
  description?: string | undefined;
  speakingStyle?: string | undefined;
  translation: Translation;
  aliases: Alias[];
}

export interface Occurrence {
  chapterId: string;
  count: number;
}

export interface Alias {
  name: string;
  translation: Translation;
}
