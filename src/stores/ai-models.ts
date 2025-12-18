import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AIModel } from 'src/services/ai/types/ai-model';
import { useSettingsStore } from './settings';
import { aiModelService } from 'src/services/ai-model-service';

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

      const models = await aiModelService.getAllModels();
      // 确保 lastEdited 是 Date 对象，如果不存在则使用当前时间
      this.models = models.map((model) => ({
        ...model,
        lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(),
      }));
      this.isLoaded = true;
    },

    /**
     * 添加新的 AI 模型
     */
    async addModel(model: AIModel): Promise<void> {
      // 确保 lastEdited 已设置，如果没有则使用当前时间
      const modelWithLastEdited: AIModel = {
        ...model,
        lastEdited: model.lastEdited || new Date(),
      };
      this.models.push(modelWithLastEdited);
      await aiModelService.saveModel(modelWithLastEdited);
    },

    /**
     * 更新 AI 模型
     */
    async updateModel(id: string, updates: Partial<AIModel>): Promise<void> {
      const index = this.models.findIndex((model) => model.id === id);
      if (index > -1) {
        // 更新时自动设置 lastEdited 为当前时间
        const updatedModel = {
          ...this.models[index],
          ...updates,
          lastEdited: new Date(),
        } as AIModel;
        this.models[index] = updatedModel;
        await aiModelService.saveModel(updatedModel);
      }
    },

    /**
     * 删除 AI 模型
     */
    async deleteModel(id: string): Promise<void> {
      const index = this.models.findIndex((model) => model.id === id);
      if (index > -1) {
        this.models.splice(index, 1);
        await aiModelService.deleteModel(id);

        // 记录到删除列表
        const settingsStore = useSettingsStore();
        const gistSync = settingsStore.gistSync;
        const deletedModelIds = gistSync.deletedModelIds || [];
        
        // 检查是否已存在（避免重复）
        if (!deletedModelIds.find((record) => record.id === id)) {
          deletedModelIds.push({
            id,
            deletedAt: Date.now(),
          });
          await settingsStore.updateGistSync({
            deletedModelIds,
          });
        }
      }
    },

    /**
     * 切换模型的启用状态
     */
    async toggleModelEnabled(id: string): Promise<void> {
      const model = this.models.find((m) => m.id === id);
      if (model) {
        model.enabled = !model.enabled;
        // 更新时自动设置 lastEdited 为当前时间
        model.lastEdited = new Date();
        await aiModelService.saveModel(model);
      }
    },

    /**
     * 设置模型为特定任务的默认模型
     */
    async setDefaultForTask(
      id: string,
      task: keyof AIModel['isDefault'],
      isDefault: boolean,
    ): Promise<void> {
      const model = this.models.find((m) => m.id === id);
      if (model) {
        // 如果设置为默认，先取消其他模型的默认状态
        if (isDefault) {
          const modelsToUpdate: AIModel[] = [];
          this.models.forEach((m) => {
            if (m.id !== id && m.isDefault[task]) {
              m.isDefault[task] = { ...m.isDefault[task], enabled: false };
              // 更新时自动设置 lastEdited 为当前时间
              m.lastEdited = new Date();
              modelsToUpdate.push(m);
            }
          });
          // 批量更新其他模型
          if (modelsToUpdate.length > 0) {
            await aiModelService.bulkSaveModels(modelsToUpdate);
          }
        }
        // 保持现有的 temperature，只更新 enabled
        const currentConfig = model.isDefault[task];
        model.isDefault[task] = {
          enabled: isDefault,
          temperature: currentConfig?.temperature ?? 0.7,
        };
        // 更新时自动设置 lastEdited 为当前时间
        model.lastEdited = new Date();
        await aiModelService.saveModel(model);
      }
    },

    /**
     * 清空所有模型（用于重置）
     */
    async clearModels(): Promise<void> {
      await aiModelService.clearModels();
      this.models = [];
    },

    /**
     * 批量导入模型（用于导入配置）
     * 先清空现有模型，然后批量添加新模型
     */
    async bulkImportModels(models: AIModel[]): Promise<void> {
      // 先清空现有模型
      await aiModelService.clearModels();
      this.models = [];

      // 批量保存到 IndexedDB
      if (models.length > 0) {
        // 确保导入的模型都有 lastEdited，如果没有则使用当前时间（这是 CREATE 操作）
        const modelsWithLastEdited = models.map((model) => ({
          ...model,
          lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(),
        }));
        await aiModelService.bulkSaveModels(modelsWithLastEdited);
        // 重新从 DB 加载，确保状态一致
        const loadedModels = await aiModelService.getAllModels();
        // 确保 lastEdited 是 Date 对象
        this.models = loadedModels.map((model) => ({
          ...model,
          lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(),
        }));
      }
      this.isLoaded = true;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIModelsStore, import.meta.hot));
}
