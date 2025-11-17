import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AIModel } from 'src/types/ai/ai-model';

const STORAGE_KEY = 'luna-ai-models';

/**
 * 从本地存储加载 AI 模型
 */
function loadModelsFromStorage(): AIModel[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as AIModel[];
    }
  } catch (error) {
    console.error('Failed to load AI models from storage:', error);
  }
  return [];
}

/**
 * 保存 AI 模型到本地存储
 */
function saveModelsToStorage(models: AIModel[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch (error) {
    console.error('Failed to save AI models to storage:', error);
  }
}

export const useAIModelsStore = defineStore('aiModels', {
  state: () => ({
    models: loadModelsFromStorage(),
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
     */
    getDefaultModelForTask: (state) => {
      return (task: keyof AIModel['isDefault']): AIModel | undefined => {
        return state.models.find((model) => model.enabled && model.isDefault[task]?.enabled);
      };
    },
  },

  actions: {
    /**
     * 添加新的 AI 模型
     */
    addModel(model: AIModel): void {
      this.models.push(model);
      saveModelsToStorage(this.models);
    },

    /**
     * 更新 AI 模型
     */
    updateModel(id: string, updates: Partial<AIModel>): void {
      const index = this.models.findIndex((model) => model.id === id);
      if (index > -1) {
        this.models[index] = { ...this.models[index], ...updates } as AIModel;
        saveModelsToStorage(this.models);
      }
    },

    /**
     * 删除 AI 模型
     */
    deleteModel(id: string): void {
      const index = this.models.findIndex((model) => model.id === id);
      if (index > -1) {
        this.models.splice(index, 1);
        saveModelsToStorage(this.models);
      }
    },

    /**
     * 切换模型的启用状态
     */
    toggleModelEnabled(id: string): void {
      const model = this.models.find((m) => m.id === id);
      if (model) {
        model.enabled = !model.enabled;
        saveModelsToStorage(this.models);
      }
    },

    /**
     * 设置模型为特定任务的默认模型
     */
    setDefaultForTask(id: string, task: keyof AIModel['isDefault'], isDefault: boolean): void {
      const model = this.models.find((m) => m.id === id);
      if (model) {
        // 如果设置为默认，先取消其他模型的默认状态
        if (isDefault) {
          this.models.forEach((m) => {
            if (m.id !== id && m.isDefault[task]) {
              m.isDefault[task] = { ...m.isDefault[task], enabled: false };
            }
          });
        }
        // 保持现有的 temperature，只更新 enabled
        const currentConfig = model.isDefault[task];
        model.isDefault[task] = {
          enabled: isDefault,
          temperature: currentConfig?.temperature ?? 0.7,
        };
        saveModelsToStorage(this.models);
      }
    },

    /**
     * 清空所有模型（用于重置）
     */
    clearModels(): void {
      this.models = [];
      saveModelsToStorage(this.models);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIModelsStore, import.meta.hot));
}
