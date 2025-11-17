import type { AIModel } from './ai/ai-model';
import type { Novel } from './novel';
import type { SyncConfig } from './sync';

export interface Settings {
  aiModels: AIModel[];
  sync: SyncConfig[];
  novels: Novel[];
}
