import { ref, computed, watch, onMounted, inject, provide, type InjectionKey } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useConfirm } from 'primevue/useconfirm';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { AIModel, AIProvider } from 'src/services/ai/types/ai-model';
import { useAIModelsStore } from 'src/stores/ai-models';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { cloneDeep } from 'lodash';

type ProviderGroup = {
  provider: AIProvider;
  label: string;
  letter: string;
  color: string;
  models: AIModel[];
  enabledCount: number;
};

export type AIPageContext = ReturnType<typeof createAIPageContext>;

const AI_PAGE_KEY: InjectionKey<AIPageContext> = Symbol('ai-page');

export function provideAIPage(): AIPageContext {
  const ctx = createAIPageContext();
  provide(AI_PAGE_KEY, ctx);
  return ctx;
}

export function injectAIPage(): AIPageContext {
  const ctx = inject(AI_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectAIPage() called outside an AIPage dispatcher — ensure the variant is mounted by AIPage.vue.',
    );
  }
  return ctx;
}

function createAIPageContext() {
  const aiModelsStore = useAIModelsStore();
  const confirm = useConfirm();
  const toast = useToastWithHistory();

  const isPageLoading = ref(true);
  const aiModels = computed(() => aiModelsStore.models);
  const selectedModel = ref<AIModel | null>(null);
  const showAddDialog = ref(false);
  const showEditDialog = ref(false);
  const searchQuery = ref('');

  const providerPalette: Record<AIProvider, { label: string; letter: string; color: string }> = {
    openai: { label: 'OpenAI', letter: 'O', color: '#10A37F' },
    gemini: { label: 'Google Gemini', letter: 'G', color: '#4A8FE7' },
  };

  const getProviderLabel = (provider: string) => {
    return provider === 'openai' ? 'OpenAI' : 'Gemini';
  };

  const getDefaultTasks = (model: AIModel) => {
    const tasks: string[] = [];
    if (model.isDefault.translation?.enabled) tasks.push(TASK_TYPE_LABELS.translation);
    if (model.isDefault.proofreading?.enabled) tasks.push('校对和润色');
    if (model.isDefault.termsTranslation?.enabled) tasks.push(TASK_TYPE_LABELS.termsTranslation);
    if (model.isDefault.assistant?.enabled) tasks.push(TASK_TYPE_LABELS.assistant);
    return tasks.join('、') || '无';
  };

  const providerGroups = computed<ProviderGroup[]>(() => {
    const byProvider = new Map<AIProvider, AIModel[]>();
    for (const model of aiModels.value) {
      const list = byProvider.get(model.provider) ?? [];
      list.push(model);
      byProvider.set(model.provider, list);
    }
    const groups: ProviderGroup[] = [];
    for (const [provider, models] of byProvider) {
      const meta = providerPalette[provider] ?? {
        label: provider,
        letter: provider.slice(0, 1).toUpperCase(),
        color: '#6D88A8',
      };
      groups.push({
        provider,
        label: meta.label,
        letter: meta.letter,
        color: meta.color,
        models,
        enabledCount: models.filter((m) => m.enabled).length,
      });
    }
    return groups.sort((a, b) => a.label.localeCompare(b.label));
  });

  const taskRouting = computed(() => {
    const pick = (key: keyof AIModel['isDefault']) => {
      const m = aiModels.value.find((x) => x.isDefault?.[key]?.enabled);
      return m ? `${getProviderLabel(m.provider)} · ${m.name}` : '未配置';
    };
    return [
      { label: '翻译 (初译)', value: pick('translation') },
      { label: '校对 / 润色', value: pick('proofreading') },
      { label: '术语翻译', value: pick('termsTranslation') },
      { label: 'AI 助手', value: pick('assistant') },
    ];
  });

  const filteredModels = computed(() => {
    if (!searchQuery.value.trim()) return aiModels.value;
    const query = searchQuery.value.toLowerCase().trim();
    return aiModels.value.filter((model) => {
      const name = model.name.toLowerCase();
      const provider = getProviderLabel(model.provider).toLowerCase();
      const modelName = model.model.toLowerCase();
      const defaultTasks = getDefaultTasks(model).toLowerCase();
      return (
        name.includes(query) ||
        provider.includes(query) ||
        modelName.includes(query) ||
        defaultTasks.includes(query)
      );
    });
  });

  const generateId = (): string => uuidv4();

  const addModel = () => {
    selectedModel.value = null;
    showAddDialog.value = true;
  };

  const editModel = (model: AIModel) => {
    selectedModel.value = { ...model };
    showEditDialog.value = true;
  };

  const duplicateModel = (model: AIModel) => {
    const duplicatedModel: AIModel = {
      ...model,
      id: generateId(),
      name: `${model.name} (副本)`,
      enabled: false,
      lastEdited: new Date(),
    };
    void aiModelsStore.addModel(duplicatedModel);
    toast.add({
      severity: 'success',
      summary: '复制成功',
      detail: `已成功复制模型 "${model.name}"`,
      life: 3000,
      onRevert: () => aiModelsStore.deleteModel(duplicatedModel.id),
    });
  };

  const handleSave = (formData: Partial<AIModel> & { isDefault: AIModel['isDefault'] }) => {
    if (showAddDialog.value) {
      const newModel: AIModel = {
        id: generateId(),
        name: formData.name!,
        provider: formData.provider as AIProvider,
        model: formData.model!,
        temperature: formData.temperature!,
        maxInputTokens: formData.maxInputTokens!,
        maxOutputTokens: formData.maxOutputTokens!,
        ...(formData.rateLimit !== undefined && formData.rateLimit !== null
          ? { rateLimit: formData.rateLimit }
          : {}),
        apiKey: formData.apiKey!,
        baseUrl: formData.baseUrl!,
        enabled: formData.enabled ?? true,
        useCorsProxy: formData.useCorsProxy,
        isDefault: {
          translation: formData.isDefault?.translation ?? { enabled: false, temperature: 0.7 },
          proofreading: formData.isDefault?.proofreading ?? { enabled: false, temperature: 0.7 },
          termsTranslation: formData.isDefault?.termsTranslation ?? {
            enabled: false,
            temperature: 0.7,
          },
          assistant: formData.isDefault?.assistant ?? { enabled: false, temperature: 0.7 },
        },
        lastEdited: new Date(),
      };
      void aiModelsStore.addModel(newModel);
      showAddDialog.value = false;
      toast.add({
        severity: 'success',
        summary: '添加成功',
        detail: `已成功添加模型 "${newModel.name}"`,
        life: 3000,
        onRevert: () => aiModelsStore.deleteModel(newModel.id),
      });
    } else if (showEditDialog.value && selectedModel.value) {
      const updates: Partial<AIModel> = {
        name: formData.name!,
        provider: formData.provider as AIProvider,
        model: formData.model!,
        temperature: formData.temperature!,
        maxInputTokens: formData.maxInputTokens!,
        maxOutputTokens: formData.maxOutputTokens!,
        apiKey: formData.apiKey!,
        baseUrl: formData.baseUrl!,
        enabled: formData.enabled ?? true,
        useCorsProxy: formData.useCorsProxy,
        isDefault: {
          translation: formData.isDefault?.translation ?? { enabled: false, temperature: 0.7 },
          proofreading: formData.isDefault?.proofreading ?? { enabled: false, temperature: 0.7 },
          termsTranslation: formData.isDefault?.termsTranslation ?? {
            enabled: false,
            temperature: 0.7,
          },
          assistant: formData.isDefault?.assistant ?? { enabled: false, temperature: 0.7 },
        },
      };

      if (formData.rateLimit !== undefined && formData.rateLimit !== null) {
        updates.rateLimit = formData.rateLimit;
      }

      const oldModel = cloneDeep(selectedModel.value);
      void aiModelsStore.updateModel(selectedModel.value.id, updates);
      showEditDialog.value = false;
      const modelName = updates.name || selectedModel.value.name;
      selectedModel.value = null;
      toast.add({
        severity: 'success',
        summary: '更新成功',
        detail: `已成功更新模型 "${modelName}"`,
        life: 3000,
        onRevert: () => aiModelsStore.updateModel(oldModel.id, oldModel),
      });
    }
  };

  const deleteModel = (model: AIModel) => {
    confirm.require({
      group: 'ai-model',
      message: `确定要删除模型 "${model.name}" 吗？`,
      header: '确认删除',
      icon: 'pi pi-exclamation-triangle',
      rejectProps: { label: '取消', severity: 'secondary' },
      acceptProps: { label: '删除', severity: 'danger' },
      accept: () => {
        const modelName = model.name;
        const modelToRestore = cloneDeep(model);
        void aiModelsStore.deleteModel(model.id);
        toast.add({
          severity: 'success',
          summary: '删除成功',
          detail: `已成功删除模型 "${modelName}"`,
          life: 3000,
          onRevert: () => aiModelsStore.addModel(modelToRestore),
        });
      },
    });
  };

  watch([showAddDialog, showEditDialog], ([addVisible, editVisible]) => {
    if (!addVisible && !editVisible) {
      selectedModel.value = null;
    }
  });

  const formatApiKey = (apiKey: string): string => {
    if (!apiKey) return '';
    if (apiKey.length <= 6) return apiKey;
    const prefix = apiKey.substring(0, 6);
    const maskedLength = apiKey.length - 6;
    return prefix + '*'.repeat(maskedLength);
  };

  onMounted(async () => {
    if (!aiModelsStore.isLoaded) {
      await aiModelsStore.loadModels();
    }
    isPageLoading.value = false;
  });

  return {
    isPageLoading,
    aiModels,
    providerGroups,
    taskRouting,
    filteredModels,
    selectedModel,
    showAddDialog,
    showEditDialog,
    searchQuery,
    getProviderLabel,
    getDefaultTasks,
    formatApiKey,
    addModel,
    editModel,
    duplicateModel,
    deleteModel,
    handleSave,
  };
}
