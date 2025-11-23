import { getDB } from 'src/utils/indexed-db';
import type { AIModel } from 'src/services/ai/types/ai-model';

export class AIModelService {
  /**
   * 获取所有 AI 模型
   */
  async getAllModels(): Promise<AIModel[]> {
    try {
      const db = await getDB();
      return await db.getAll('ai-models');
    } catch (error) {
      console.error('Failed to load AI models from DB:', error);
      return [];
    }
  }

  /**
   * 获取单个 AI 模型
   */
  async getModel(id: string): Promise<AIModel | undefined> {
    try {
      const db = await getDB();
      return await db.get('ai-models', id);
    } catch (error) {
      console.error(`Failed to load AI model ${id} from DB:`, error);
      return undefined;
    }
  }

  /**
   * 保存/更新单个 AI 模型
   */
  async saveModel(model: AIModel): Promise<void> {
    try {
      const db = await getDB();
      // 将响应式对象序列化为纯对象，避免 DataCloneError
      const serializedModel = JSON.parse(JSON.stringify(model)) as AIModel;
      await db.put('ai-models', serializedModel);
    } catch (error) {
      console.error('Failed to save AI model to DB:', error);
      throw error;
    }
  }

  /**
   * 删除 AI 模型
   */
  async deleteModel(id: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete('ai-models', id);
    } catch (error) {
      console.error('Failed to delete AI model from DB:', error);
      throw error;
    }
  }

  /**
   * 批量保存 AI 模型
   */
  async bulkSaveModels(models: AIModel[]): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction('ai-models', 'readwrite');
      const store = tx.objectStore('ai-models');

      for (const model of models) {
        // 将响应式对象序列化为纯对象，避免 DataCloneError
        const serializedModel = JSON.parse(JSON.stringify(model)) as AIModel;
        await store.put(serializedModel);
      }

      await tx.done;
    } catch (error) {
      console.error('Failed to bulk save AI models to DB:', error);
      throw error;
    }
  }

  /**
   * 清空所有模型
   */
  async clearModels(): Promise<void> {
    try {
      const db = await getDB();
      await db.clear('ai-models');
    } catch (error) {
      console.error('Failed to clear AI models from DB:', error);
      throw error;
    }
  }
}

export const aiModelService = new AIModelService();

