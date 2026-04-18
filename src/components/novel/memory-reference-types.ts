export interface MemoryReference {
  memoryId: string;
  summary: string;
  accessedAt: number;
  toolName: 'get_memory' | 'search_memories';
}
