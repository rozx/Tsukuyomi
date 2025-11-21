import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AIModel } from 'src/types/ai/ai-model';
import { useSettingsStore } from './settings';
import { getDB } from 'src/utils/indexed-db';

/**
 * 从 IndexedDB 加载所有 AI 模型
 */
async function loadModelsFromDB(): Promise<AIModel[]> {
  try {
    const db = await getDB();
    return await db.getAll('ai-models');
  } catch (error) {
    console.error('Failed to load AI models from DB:', error);
    return [];
  }
}

/**
 * 保存单个 AI 模型到 IndexedDB
 */
async function saveModelToDB(model: AIModel): Promise<void> {
  try {
    const db = await getDB();
    await db.put('ai-models', model);
  } catch (error) {
    console.error('Failed to save AI model to DB:', error);
  }
}

/**
 * 从 IndexedDB 删除 AI 模型
 */
async function deleteModelFromDB(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('ai-models', id);
  } catch (error) {
    console.error('Failed to delete AI model from DB:', error);
  }
}

/**
 * 批量保存 AI 模型到 IndexedDB
 */
async function bulkSaveModelsToDB(models: AIModel[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('ai-models', 'readwrite');
    const store = tx.objectStore('ai-models');

    for (const model of models) {
      await store.put(model);
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to bulk save AI models to DB:', error);
  }
}

export const useAIModelsStore = defineStore('aiModels', {
  state: () => ({
    models: [] as AIModel[],
    isLoaded: false,
  }),

  getters: {
    /**
     * 获取所有已启用的模型
     */
    enabledModels: (state): AIModel[] => {
      return state.models.filter((model) => model.enabled);
    },

    /**
     * 根据 ID 获取模型
     */
    getModelById: (state) => {
      return (id: string): AIModel | undefined => {
        return state.models.find((model) => model.id === id);
      };
    },

    /**
     * 获取默认用于特定任务的模型
     * 优先使用设置中的配置，如果没有则回退到模型的 isDefault 配置
     */
    getDefaultModelForTask: (state) => {
      return (task: keyof AIModel['isDefault']): AIModel | undefined => {
        // 优先使用设置中的配置
        const settingsStore = useSettingsStore();
        const modelIdFromSettings = settingsStore.getTaskDefaultModelId(task);
        if (modelIdFromSettings) {
          const model = state.models.find((m) => m.id === modelIdFromSettings && m.enabled);
          if (model) {
            return model;
          }
        }
        // 回退到模型的 isDefault 配置（向后兼容）
        return state.models.find((model) => model.enabled && model.isDefault[task]?.enabled);
      };
    },
  },

  actions: {
    /**
     * 从 IndexedDB 加载所有 AI 模型
     */
    async loadModels(): Promise<void> {
      if (this.isLoaded) {
        return;
      }

      this.models = await loadModelsFromDB();
      this.isLoaded = true;
    },

    /**
     * 添加新的 AI 模型
     */
    async addModel(model: AIModel): Promise<void> {
      this.models.push(model);
      await saveModelToDB(model);
    },

    /**
     * 更新 AI 模型
     */
    async updateModel(id: string, updates: Partial<AIModel>): Promise<void> {
      const index = this.models.findIndex((model) => model.id === id);
      if (index > -1) {
        const updatedModel = { ...this.models[index], ...updates } as AIModel;
        this.models[index] = updatedModel;
        await saveModelToDB(updatedModel);
      }
    },

    /**
     * 删除 AI 模型
     */
    async deleteModel(id: string): Promise<void> {
      const index = this.models.findIndex((model) => model.id === id);
      if (index > -1) {
        this.models.splice(index, 1);
        await deleteModelFromDB(id);
      }
    },

    /**
     * 切换模型的启用状态
     */
    async toggleModelEnabled(id: string): Promise<void> {
      const model = this.models.find((m) => m.id === id);
      if (model) {
        model.enabled = !model.enabled;
        await saveModelToDB(model);
      }
    },

    /**
     * 设置模型为特定任务的默认模型
     */
    async setDefaultForTask(id: string, task: keyof AIModel['isDefault'], isDefault: boolean): Promise<void> {
      const model = this.models.find((m) => m.id === id);
      if (model) {
        // 如果设置为默认，先取消其他模型的默认状态
        if (isDefault) {
          const modelsToUpdate: AIModel[] = [];
          this.models.forEach((m) => {
            if (m.id !== id && m.isDefault[task]) {
              m.isDefault[task] = { ...m.isDefault[task], enabled: false };
              modelsToUpdate.push(m);
            }
          });
          // 批量更新其他模型
          await bulkSaveModelsToDB(modelsToUpdate);
        }
        // 保持现有的 temperature，只更新 enabled
        const currentConfig = model.isDefault[task];
        model.isDefault[task] = {
          enabled: isDefault,
          temperature: currentConfig?.temperature ?? 0.7,
        };
        await saveModelToDB(model);
      }
    },

    /**
     * 清空所有模型（用于重置）
     */
    async clearModels(): Promise<void> {
      const db = await getDB();
      await db.clear('ai-models');
      this.models = [];
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIModelsStore, import.meta.hot));
}
