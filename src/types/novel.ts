import type { AIModel } from './ai-model';

// 小说
export interface Novel {
  id: string;
  title: string;
  author?: string;
  description?: string;
  cover?: CoverImage;
  tags?: string[];
  volumes?: Volume[];
  webUrl?: string[];
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
  lastEdited: Date;
  createdAt: Date;
  specialInstructions?: string; // 特殊指令，如：翻译时需要保留原文的格式
}

export interface Paragraph {
  id: string;
  text: string;
  selectedTranslation: string; // id of Translation
  translations: Translation[];
  lastEdited: Date;
  createdAt: Date;
}

export interface Translation {
  id: string;
  translation: string;
  aiModel: string; // id of AIModel
  lastTranslatedAt: Date;
  createdAt: Date;
}

export interface Note {
  id: string;
  text: string;
  aiResults: string[];
  defaultAIModel: string; // id of AIModel
  lastEdited: Date;
  createdAt: Date;
  references: Chapter[];
}

// 术语
export interface Terminology {
  id: string;
  name: string;
  description?: string;
  translation: Translation[];
  lastEdited: Date;
  createdAt: Date;
  references: string[];
  occurrences: number;
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
  references: string[];
  occurrences: number;
}
