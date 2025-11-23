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
  title: {
    original: string;
    translation: Translation;
  };
  description?: string | undefined;
  cover?: CoverImage | undefined;
  chapters?: Chapter[] | undefined;
}

export interface Chapter {
  id: string;
  title: {
    original: string;
    translation: Translation;
  };
  webUrl?: string | undefined; // 网络地址
  content?: Paragraph[] | undefined;
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

  specialInstructions?: string | undefined; // 特殊指令，如：翻译时需要保留原文的格式
}

export interface Paragraph {
  id: string;
  text: string;
  selectedTranslationId: string; // id of Translation
  translations: Translation[];
}

export interface Translation {
  id: string;
  translation: string;
  aiModelId: string; // id of AIModel
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
  occurrences: Occurrence[];
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
  occurrences: Occurrence[];
}

export interface Occurrence {
  chapterId: string;
  count: number;
}

export interface Alias {
  name: string;
  translation: Translation;
}
