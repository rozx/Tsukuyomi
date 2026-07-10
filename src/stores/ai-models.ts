import { defineStore, acceptHMRUpdate } from 'pinia';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { Novel } from 'src/models/novel';
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

    /**
     * 获取任务实际使用的模型：优先本书覆盖（须指向已启用模型），否则回退全局默认。
     * 覆盖指向已删除/禁用的模型时静默回退，不报错、不清理覆盖字段。
     */
    getModelForTask() {
      return (
        task: keyof AIModel['isDefault'],
        book?: Novel | null,
      ): AIModel | undefined => {
        const overrideId =
          task === 'translation' || task === 'proofreading'
            ? book?.taskModelOverrides?.[task]
            : undefined;
        if (overrideId) {
          const model = this.models.find((m) => m.id === overrideId && m.enabled);
          if (model) return model;
        }
        return this.getDefaultModelForTask(task);
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
      // 确保 lastEdited 是 Date 对象，如果不存在则使用 epoch 时间（确保远程模型优先）
      this.models = models.map((model) => ({
        ...model,
        lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(0),
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
        // 确保导入的模型都有 lastEdited，如果没有则使用 epoch 时间（确保远程模型优先）
        const modelsWithLastEdited = models.map((model) => ({
          ...model,
          lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(0),
        }));
        await aiModelService.bulkSaveModels(modelsWithLastEdited);
        // 重新从 DB 加载，确保状态一致
        const loadedModels = await aiModelService.getAllModels();
        // 确保 lastEdited 是 Date 对象
        this.models = loadedModels.map((model) => ({
          ...model,
          lastEdited: model.lastEdited ? new Date(model.lastEdited) : new Date(0),
        }));
      }
      this.isLoaded = true;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAIModelsStore, import.meta.hot));
}
