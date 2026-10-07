import { ref, computed, watch, onMounted, inject, provide, type InjectionKey } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { useConfirm } from 'primevue/useconfirm';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { AIModel, AIModelDefaultTasks, AIProvider } from 'src/services/ai/types/ai-model';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import { useI18n } from 'vue-i18n';
import { cloneDeep } from 'lodash';

type TaskKey = keyof AIModelDefaultTasks;
type TaskRoutingOption = {
  label: string;
  value: string;
};

const AUTO_TASK_ROUTING_VALUE = '__auto__';

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

/**
 * 构造 AIModel.isDefault 的补齐对象：四个任务若 formData 未提供则回退到 `{enabled:false,temperature:0.7}`。
 * 由 addModel 与 editModel 共用。
 */
function buildAIModelDefaults(formData: Partial<AIModel>): AIModel['isDefault'] {
  const defaultTask = { enabled: false, temperature: 0.7 };
  return {
    translation: formData.isDefault?.translation ?? { ...defaultTask },
    proofreading: formData.isDefault?.proofreading ?? { ...defaultTask },
    termsTranslation: formData.isDefault?.termsTranslation ?? { ...defaultTask },
    assistant: formData.isDefault?.assistant ?? { ...defaultTask },
  };
}

function createAIPageContext() {
  const { t } = useI18n();
  const aiModelsStore = useAIModelsStore();
  const settingsStore = useSettingsStore();
  const confirm = useConfirm();
  const toast = useToastWithHistory();

  const isPageLoading = ref(true);
  const aiModels = computed(() => aiModelsStore.models);
  const selectedModel = ref<AIModel | null>(null);
  const showAddDialog = ref(false);
  const showEditDialog = ref(false);
  const searchQuery = ref('');
  const routingPickerTask = ref<TaskKey | null>(null);

  const providerPalette: Record<AIProvider, { label: string; letter: string; color: string }> = {
    openai: { label: 'OpenAI', letter: 'O', color: '#10A37F' },
    gemini: { label: 'Google Gemini', letter: 'G', color: '#4A8FE7' },
  };

  const getProviderLabel = (provider: string) => {
    return provider === 'openai' ? 'OpenAI' : 'Gemini';
  };

  const DEFAULT_TASK_LABELS = computed<Array<{ key: keyof AIModel['isDefault']; label: string }>>(
    () => [
      { key: 'translation', label: t('aiUi.translation') },
      { key: 'proofreading', label: t('aiUi.proofreadingCombined') },
      { key: 'termsTranslation', label: t('aiUi.termsTranslation') },
      { key: 'assistant', label: t('aiUi.assistant') },
    ],
  );

  const getDefaultTasks = (model: AIModel) => {
    const tasks = DEFAULT_TASK_LABELS.value
      .filter(({ key }) => model.isDefault[key]?.enabled)
      .map(({ label }) => label);
    return tasks.join(t('aiUi.separator')) || t('aiUi.none');
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

  // 任务路由行 — 每行包含任务 key、显示标签，以及当前绑定的模型 ID / 显示值。
  // 数据来自 `aiModelsStore.getDefaultModelForTask`（优先读 settings.taskDefaultModels，
  // 回退到模型自身的 isDefault 标记），与实际 AI 任务分发逻辑保持一致。
  const TASK_ROWS = computed<Array<{ task: TaskKey; label: string }>>(() => [
    { task: 'translation', label: t('aiUi.firstTranslation') },
    { task: 'proofreading', label: t('aiUi.proofreading') },
    { task: 'termsTranslation', label: t('aiUi.termsTranslation') },
    { task: 'assistant', label: t('aiUi.assistant') },
  ]);

  const taskRouting = computed(() =>
    TASK_ROWS.value.map((row) => {
      // 依赖 models 数组触发 re-eval（getter 本身不在 computed 追踪链里）
      void aiModels.value;
      const model = aiModelsStore.getDefaultModelForTask(row.task);
      return {
        task: row.task,
        label: row.label,
        modelId: model?.id ?? null,
        value: model
          ? `${getProviderLabel(model.provider)} · ${model.name}`
          : t('aiUi.notConfigured'),
      };
    }),
  );

  const getTaskRoutingOptions = (task: TaskKey): TaskRoutingOption[] => {
    const availableModels = aiModelsStore.enabledModels.filter(
      (model) => model.isDefault[task]?.enabled === true,
    );
    return [
      { label: t('aiUi.automatic'), value: AUTO_TASK_ROUTING_VALUE },
      ...availableModels.map((model) => ({
        label: `${getProviderLabel(model.provider)} · ${model.name}`,
        value: model.id,
      })),
    ];
  };

  // 纯函数：仅读取当前绑定的任务路由，不做清理副作用（否则会在 render 期间触发 store 写入）。
  // 失效的绑定由下方的 pruneInvalidTaskRoutings()（onMounted + watch aiModels）异步清理。
  const getTaskRoutingSelectValue = (task: TaskKey): string => {
    const explicitModelId = settingsStore.getTaskDefaultModelId(task);
    if (!explicitModelId) return AUTO_TASK_ROUTING_VALUE;
    const model = aiModelsStore.getModelById(explicitModelId);
    if (model && model.enabled && model.isDefault[task]?.enabled) {
      return explicitModelId;
    }
    return AUTO_TASK_ROUTING_VALUE;
  };

  const pruneInvalidTaskRoutings = async (): Promise<void> => {
    if (
      !aiModelsStore.isLoaded ||
      settingsStore.isSyncing ||
      settingsStore.isRestoringSyncSnapshot
    ) {
      return;
    }
    const tasks: TaskKey[] = ['translation', 'proofreading', 'termsTranslation', 'assistant'];
    for (const task of tasks) {
      const explicitModelId = settingsStore.getTaskDefaultModelId(task);
      if (!explicitModelId) continue;
      const model = aiModelsStore.getModelById(explicitModelId);
      // 同步会先应用设置再逐个载入模型；尚未到达的模型不能当作用户取消选择。
      if (!model) continue;
      if (model?.enabled && model.isDefault[task]?.enabled) continue;
      try {
        await settingsStore.setTaskDefaultModelId(task, null);
      } catch (error) {
        console.error('Failed to prune invalid task routing:', error);
      }
    }
  };

  const routingPickerOptions = computed(() => {
    const task = routingPickerTask.value;
    if (!task) return [];
    return aiModelsStore.enabledModels.filter((model) => model.isDefault[task]?.enabled === true);
  });

  const routingPickerCurrentModelId = computed(() => {
    const task = routingPickerTask.value;
    if (!task) return null;
    const model = aiModelsStore.getDefaultModelForTask(task);
    return model?.id ?? null;
  });

  const routingPickerTaskLabel = computed(() => {
    const task = routingPickerTask.value;
    if (!task) return '';
    return TASK_ROWS.value.find((row) => row.task === task)?.label ?? '';
  });

  const openTaskRoutingPicker = (task: TaskKey) => {
    routingPickerTask.value = task;
  };

  const closeTaskRoutingPicker = () => {
    routingPickerTask.value = null;
  };

  const setTaskRoutingModelId = async (task: TaskKey, selectedValue: string) => {
    try {
      await settingsStore.setTaskDefaultModelId(
        task,
        selectedValue === AUTO_TASK_ROUTING_VALUE ? null : selectedValue,
      );
    } catch (error) {
      console.error('Failed to set task default model:', error);
      toast.add({
        severity: 'error',
        summary: t('aiUi.settingFailed'),
        detail: t('aiUi.routingSaveFailed'),
        life: 3000,
      });
    }
  };

  const pickModelForTask = async (modelId: string | null) => {
    const task = routingPickerTask.value;
    if (!task) return;
    try {
      await settingsStore.setTaskDefaultModelId(task, modelId);
      routingPickerTask.value = null;
    } catch (error) {
      console.error('Failed to set task default model:', error);
      toast.add({
        severity: 'error',
        summary: t('aiUi.settingFailed'),
        detail: t('aiUi.routingSaveFailed'),
        life: 3000,
      });
    }
  };

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
      name: t('aiUi.copyName', { name: model.name }),
      enabled: false,
      lastEdited: new Date(),
    };
    void aiModelsStore.addModel(duplicatedModel);
    toast.add({
      severity: 'success',
      summary: t('aiUi.copied'),
      detail: t('aiUi.copiedModel', { name: model.name }),
      life: 3000,
      onRevert: () => aiModelsStore.deleteModel(duplicatedModel.id),
    });
  };

  type SaveFormData = Partial<AIModel> & { isDefault: AIModel['isDefault'] };

  const buildEditableModel = (formData: SaveFormData): Omit<AIModel, 'id' | 'lastEdited'> => ({
    name: formData.name!,
    provider: formData.provider as AIProvider,
    model: formData.model!,
    temperature: formData.temperature!,
    maxInputTokens: formData.maxInputTokens!,
    maxOutputTokens: formData.maxOutputTokens!,
    ...(formData.thinkingLevel !== undefined ? { thinkingLevel: formData.thinkingLevel } : {}),
    ...(formData.limitsSource ? { limitsSource: formData.limitsSource } : {}),
    ...(formData.rateLimit !== undefined && formData.rateLimit !== null
      ? { rateLimit: formData.rateLimit }
      : {}),
    apiKey: formData.apiKey!,
    baseUrl: formData.baseUrl!,
    enabled: formData.enabled ?? true,
    useCorsProxy: formData.useCorsProxy,
    customHeaders: cloneDeep(formData.customHeaders ?? {}),
    isDefault: buildAIModelDefaults(formData),
  });

  const handleSaveAdd = (formData: SaveFormData): void => {
    const newModel: AIModel = {
      id: generateId(),
      ...buildEditableModel(formData),
      lastEdited: new Date(),
    };
    void aiModelsStore.addModel(newModel);
    showAddDialog.value = false;
    toast.add({
      severity: 'success',
      summary: t('aiUi.added'),
      detail: t('aiUi.addedModel', { name: newModel.name }),
      life: 3000,
      onRevert: () => aiModelsStore.deleteModel(newModel.id),
    });
  };

  const handleSaveEdit = (formData: SaveFormData): void => {
    const current = selectedModel.value;
    if (!current) return;
    const updates = buildEditableModel(formData);
    const oldModel = cloneDeep(current);
    void aiModelsStore.updateModel(current.id, updates);
    showEditDialog.value = false;
    const modelName = updates.name || current.name;
    selectedModel.value = null;
    toast.add({
      severity: 'success',
      summary: t('aiUi.updated'),
      detail: t('aiUi.updatedModel', { name: modelName }),
      life: 3000,
      onRevert: () => aiModelsStore.updateModel(oldModel.id, oldModel),
    });
  };

  const handleSave = (formData: SaveFormData) => {
    if (showAddDialog.value) return handleSaveAdd(formData);
    if (showEditDialog.value && selectedModel.value) return handleSaveEdit(formData);
  };

  const deleteModel = (model: AIModel) => {
    confirm.require({
      group: 'ai-model',
      get message() {
        return t('aiUi.deleteQuestion', { name: model.name });
      },
      get header() {
        return t('aiUi.confirmDelete');
      },
      icon: 'pi pi-exclamation-triangle',
      rejectProps: {
        get label() {
          return t('aiUi.cancel');
        },
        severity: 'secondary',
      },
      acceptProps: {
        get label() {
          return t('aiUi.delete');
        },
        severity: 'danger',
      },
      accept: () => {
        const modelName = model.name;
        const modelToRestore = cloneDeep(model);
        void aiModelsStore.deleteModel(model.id);
        toast.add({
          severity: 'success',
          summary: t('aiUi.deleted'),
          detail: t('aiUi.deletedModel', { name: modelName }),
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
    void pruneInvalidTaskRoutings();
  });

  // 模型变化后复查绑定；同步期间暂缓，整轮结束后再校验完整的模型列表。
  // pruneInvalidTaskRoutings 本身是 O(任务数)=O(4) 的廉价操作，deep watch 的触发频率没问题。
  watch(
    [
      () => aiModels.value,
      () => settingsStore.isSyncing,
      () => settingsStore.isRestoringSyncSnapshot,
    ],
    () => {
      void pruneInvalidTaskRoutings();
    },
    { deep: true },
  );

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
    routingPickerTask,
    routingPickerVisible: computed({
      get: () => !!routingPickerTask.value,
      set: (visible: boolean) => {
        if (!visible) closeTaskRoutingPicker();
      },
    }),
    routingPickerTitle: computed(() => routingPickerTaskLabel.value || t('aiUi.routing')),
    routingPickerOptions,
    routingPickerCurrentModelId,
    routingPickerTaskLabel,
    openTaskRoutingPicker,
    closeTaskRoutingPicker,
    pickModelForTask,
    getTaskRoutingOptions,
    getTaskRoutingSelectValue,
    setTaskRoutingModelId,
    // 其他
    getProviderLabel,
    getDefaultTasks,
    hasDefaultTasks: (model: AIModel) =>
      Object.values(model.isDefault).some((task) => task?.enabled === true),
    formatApiKey,
    addModel,
    editModel,
    duplicateModel,
    deleteModel,
    handleSave,
  };
}
