import type { ImportFailure } from './import-feedback';
import type { Paragraph } from './novel';
import type { ImportParagraphChange } from './import';

export interface ImportOldParagraph {
  chapterId: string;
  paragraph: Paragraph;
}
export interface ImportNewParagraph {
  key: string;
  chapterId: string;
  text: string;
  newId: string;
  existing?: { chapterId: string; paragraphId: string };
}
export interface ImportParagraphMatchInput {
  scopeId: string;
  old: ImportOldParagraph[];
  next: ImportNewParagraph[];
  allowedReplacements?: string[];
}
export interface ImportReplacementRange {
  signature: string;
  oldKeys: { chapterId: string; paragraphId: string }[];
  newKeys: string[];
  /** 被替换的旧原文与替换后的新原文，供界面对比（旧版本保存的方案没有） */
  oldTexts?: string[];
  newTexts?: string[];
  clearedVersions: number;
  /** 用户已确认，或不会清空任何译文而自动接受 */
  confirmed: boolean;
}
export interface ImportParagraphMatchResult {
  paragraphs: { key: string; chapterId: string; paragraph: Paragraph }[];
  changes: ImportParagraphChange[];
  conflicts: (ImportFailure & { newKeys: string[] })[];
  replacements: ImportReplacementRange[];
}
