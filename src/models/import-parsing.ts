import type { ImportPatternJob, ImportPatternResult } from './import-pattern';
import type { ImportDiscovery, ImportExtractionRules, ImportTextBlock } from './import';
import type { ImportParagraphMatchInput, ImportParagraphMatchResult } from './import-matching';

export interface ImportParsedContent {
  format: 'text' | 'markdown' | 'html';
  kind: 'content' | 'catalog' | 'copyright' | 'cover' | 'verification' | 'dynamic' | 'empty';
  blocks: Omit<ImportTextBlock, 'id'>[];
  excluded: { start: number; end: number; text: string; reason: string }[];
  metadata: Record<string, string>;
  links: { name: string; href: string; relation: ImportDiscovery['relation'] }[];
  warnings: string[];
  rules: ImportExtractionRules;
}

export interface ImportEpubEntry {
  path: string;
  mediaType: string;
  kind: 'content' | 'catalog' | 'copyright' | 'cover' | 'resource';
  bytes: Uint8Array;
  title?: string;
  spineIndex?: number;
  linear?: boolean;
}

export interface ImportEpub {
  packages: { path: string; title?: string; author?: string }[];
  metadata: Record<string, string>;
  entries: ImportEpubEntry[];
  navigation: { title: string; path: string; anchor?: string }[];
  coverPath?: string;
  warnings: string[];
  missingEntries: string[];
}

export interface ImportDecodedText {
  text: string;
  encoding: string;
  bomBytes: number;
  warnings: string[];
}

export type ImportParseRequest =
  | ImportPatternJob
  | { kind: 'match'; input: ImportParagraphMatchInput }
  | { kind: 'decode'; bytes: Uint8Array; encoding?: string }
  | { kind: 'epub'; bytes: Uint8Array }
  | {
      kind: 'content';
      text: string;
      format: 'text' | 'markdown' | 'html';
      rules?: ImportExtractionRules;
      baseUrl?: string;
    };

export type ImportParseResponse<T extends ImportParseRequest> = T extends { kind: 'pattern' }
  ? ImportPatternResult[]
  : T extends { kind: 'decode' }
    ? ImportDecodedText
    : T extends { kind: 'epub' }
      ? ImportEpub
      : T extends { kind: 'match' }
        ? ImportParagraphMatchResult
        : ImportParsedContent;
