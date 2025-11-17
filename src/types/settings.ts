import type { AIModel } from './ai/ai-model';
import type { Novel, CoverHistoryItem } from './novel';
import type { SyncConfig } from './sync';

export interface Settings {
  aiModels: AIModel[];
  sync: SyncConfig[];
  novels: Novel[];
  coverHistory?: CoverHistoryItem[];
}

export interface ExportResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    models: AIModel[];
    novels: Novel[];
    coverHistory: CoverHistoryItem[];
  };
}
