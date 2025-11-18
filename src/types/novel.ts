import type { AIModel } from './ai/ai-model';

// 小说
export interface Novel {
  id: string;
  title: string;
  alternateTitles?: string[];
  author?: string;
  description?: string;
  cover?: CoverImage;
  tags?: string[];
  volumes?: Volume[];
  webUrl?: string[];
  starred?: boolean;
  lastEdited: Date;
  createdAt: Date;
  defaultAIModel?: {
    translation: AIModel;
    proofreading: AIModel;
    polishing: AIModel;
    characterExtraction: AIModel;
    terminologyExtraction: AIModel;
  };
  characterSettings?: CharacterSetting[];
  terminologies?: Terminology[];
  notes?: Note[];
}

export interface CoverImage {
  url: string;
  deleteUrl?: string;
}

export interface CoverHistoryItem extends CoverImage {
  id: string;
  addedAt: Date;
}

export interface Volume {
  id: string;
  title: string;
  description?: string;
  cover?: CoverImage;
  chapters?: Chapter[];
}

export interface Chapter {
  id: string;
  title: string;
  webUrl?: string; // 网络地址
  content?: Paragraph[];
  originalContent?: string; // 原始爬取的内容文本（保留原始格式）
  lastEdited: Date;
  createdAt: Date;
  lastUpdated?: Date;
  specialInstructions?: string; // 特殊指令，如：翻译时需要保留原文的格式
}

export interface Paragraph {
  id: string;
  text: string;
  selectedTranslationId: string; // id of Translation
  translations: Translation[];
  lastEdited: Date;
  createdAt: Date;
}

export interface Translation {
  id: string;
  translation: string;
  aiModelId: string; // id of AIModel
  lastTranslatedAt: Date;
  createdAt: Date;
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
  description?: string;
  translation: Translation;
  lastEdited: Date;
  createdAt: Date;
  occurrences: Occurrence[];
}

// 角色设定
export interface CharacterSetting {
  id: string;
  name: string;
  description?: string;
  translation: Translation[];
  aliases: CharacterSetting[];
  lastEdited: Date;
  createdAt: Date;
  occurrences: Occurrence[];
}

export interface Occurrence {
  chapterId: string;
  count: number;
}
