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
  clearedVersions: number;
  confirmed: boolean;
}
export interface ImportParagraphMatchResult {
  paragraphs: { key: string; chapterId: string; paragraph: Paragraph }[];
  changes: ImportParagraphChange[];
  conflicts: { code: string; message: string; newKeys: string[] }[];
  replacements: ImportReplacementRange[];
}
