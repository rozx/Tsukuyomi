export type TestTarget = 'chapter' | 'memory';

export interface TestResultItem {
  kind: TestTarget;
  targetId: string;
  title: string;
  score: number;
  preview: string;
}
