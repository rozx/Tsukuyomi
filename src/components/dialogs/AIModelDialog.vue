<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue';
import { cloneDeep, isEqual } from 'lodash';
import Button from 'primevue/button';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import AiModelBasicFields from './AiModelBasicFields.vue';
import AiModelSelector from './AiModelSelector.vue';
import AiTokenField from './AiTokenField.vue';
import AiCustomHeaders from './AiCustomHeaders.vue';
import AiTaskDefaultItem from './AiTaskDefaultItem.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useElectron } from 'src/composables/useElectron';
import { useFormDialogCloseGuard } from 'src/composables/dialogs/useUnsavedChangesDialog';
import type { AIModel, AIProvider } from 'src/services/ai/types/ai-model';
import type { AIConfigResult, ModelInfo } from 'src/services/ai/types/ai-service';
import type { AIModelFormData, TaskDefaultsKey } from './ai-model-form-types';
import { AI_MODEL_FORM_KEY } from './ai-model-form-types';
import { AIServiceFactory } from 'src/services/ai';
import { ConfigService } from 'src/services/ai/tasks/config-service';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode: 'add' | 'edit';
    model?: AIModel | null;
  }>(),
  {
    model: null,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<AIModel> & { isDefault: AIModel['isDefault'] }];
  cancel: [];
}>();

const idPrefix = computed(() => (props.mode === 'add' ? '' : 'edit'));
const toast = useToastWithHistory();
const { isBrowser } = useElectron();

// 测试相关状态
const isTesting = ref(false);

// 从 AI 获取的配置信息（只读）
const aiConfig = ref<{
  maxInputTokens?: number;
  maxOutputTokens?: number;
} | null>(null);

// 可用模型列表
const availableModels = ref<ModelInfo[]>([]);
const isLoadingModels = ref(false);

// 模型选项（用于 Dropdown）
const modelOptions = computed(() => {
  return availableModels.value.map((model) => ({
    label: model.displayName || model.name || model.id,
    value: model.id,
    model: model,
  }));
});

const createEmptyAIModelForm = (): AIModelFormData => ({
  name: '',
  provider: 'openai',
  model: '',
  temperature: 0.7,
  maxInputTokens: 0, // 0 表示无限制
  maxOutputTokens: 0, // 0 表示无限制
  apiKey: '',
  baseUrl: '',
  enabled: true,
  useCorsProxy: true,
  isDefault: {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: false, temperature: 0.7 },
  },
  customHeaders: {},
});

// 表单数据
const formData = ref<AIModelFormData>(createEmptyAIModelForm());

// 表单验证错误
const formErrors = ref<Record<string, string>>({});

// 向子组件提供共享表单上下文（formData / formErrors / idPrefix）
provide(AI_MODEL_FORM_KEY, { formData, formErrors, idPrefix });

const {
  initialFormSnapshot,
  hasUnsavedChanges,
  closeDialogImmediately,
  showUnsavedCloseConfirm,
  requestCloseDialog,
  confirmDiscardAndClose,
  cancelDiscardAndKeepEditing,
  handleDialogVisibleChange,
} = useFormDialogCloseGuard<AIModelFormData>({
  formData,
  visible: computed(() => props.visible),
  emit,
});

const hasChildDialogOpen = computed(() => showUnsavedCloseConfirm.value);

// 获取配置按钮的禁用条件（测试中、缺少必要凭据时禁用）
const canFetchConfigDisabled = computed(() => {
  return (
    isTesting.value ||
    !formData.value.apiKey?.trim() ||
    !formData.value.model?.trim() ||
    (formData.value.provider !== 'gemini' && !formData.value.baseUrl?.trim())
  );
});

// 默认任务列表（标签 + isDefault 键），供 v-for 渲染
const taskItems: ReadonlyArray<{ key: TaskDefaultsKey; label: string }> = [
  { key: 'translation', label: '翻译' },
  { key: 'proofreading', label: '校对/润色' },
  { key: 'termsTranslation', label: '术语翻译' },
  { key: 'assistant', label: '助手' },
];

// 重置表单
const resetForm = () => {
  formData.value = createEmptyAIModelForm();
  formErrors.value = {};
  aiConfig.value = null;
};

// 表单字段验证规则（每条规则互不依赖，错误信息独立收集）
const fieldValidations = (): ReadonlyArray<{
  field: keyof AIModelFormData;
  message: string;
  ok: () => boolean;
}> => [
  { field: 'name', message: '模型名称不能为空', ok: () => !!formData.value.name?.trim() },
  { field: 'model', message: '模型标识不能为空', ok: () => !!formData.value.model?.trim() },
  { field: 'apiKey', message: 'API Key 不能为空', ok: () => !!formData.value.apiKey?.trim() },
  {
    field: 'baseUrl',
    message: '基础地址不能为空',
    // Gemini 不需要 baseUrl，其他提供商需要
    ok: () => formData.value.provider === 'gemini' || !!formData.value.baseUrl?.trim(),
  },
  {
    field: 'temperature',
    message: '温度值必须在 0-2 之间',
    ok: () => {
      const t = formData.value.temperature;
      return t !== undefined && t >= 0 && t <= 2;
    },
  },
  {
    // maxInputTokens 为 0 表示无限制，不需要验证非负
    field: 'maxInputTokens',
    message: '上下文窗口不能为负数',
    ok: () => formData.value.maxInputTokens !== undefined && formData.value.maxInputTokens >= 0,
  },
  {
    // maxOutputTokens 为 0 表示无限制，不需要验证非负
    field: 'maxOutputTokens',
    message: '最大输出 Token 数不能为负数',
    ok: () => formData.value.maxOutputTokens !== undefined && formData.value.maxOutputTokens >= 0,
  },
];

// 验证表单
const validateForm = (): boolean => {
  formErrors.value = {};
  for (const rule of fieldValidations()) {
    if (!rule.ok()) {
      formErrors.value[rule.field] = rule.message;
    }
  }
  return Object.keys(formErrors.value).length === 0;
};

// 解析临时模型的身份字段（id/name/model/apiKey），均带空值回退
const resolveTempIdentity = (): Pick<AIModel, 'id' | 'name' | 'model' | 'apiKey'> => ({
  id: props.model?.id || 'temp',
  name: formData.value.name || '临时模型',
  model: formData.value.model || '',
  apiKey: formData.value.apiKey || '',
});

// 解析临时模型的数值限制（temperature / maxInputTokens / maxOutputTokens）
const resolveTempLimits = (): Pick<
  AIModel,
  'temperature' | 'maxInputTokens' | 'maxOutputTokens'
> => ({
  temperature: formData.value.temperature ?? 0.7,
  maxInputTokens: formData.value.maxInputTokens ?? 0,
  maxOutputTokens: formData.value.maxOutputTokens ?? 0,
});

// Gemini 不需要 baseUrl，其他提供商回退到空字符串
const resolveTempBaseUrl = (): string =>
  formData.value.provider === 'gemini' ? '' : formData.value.baseUrl || '';

// 构建用于获取配置的临时模型对象
const buildTempModel = (): AIModel => ({
  ...resolveTempIdentity(),
  provider: formData.value.provider as AIProvider,
  ...resolveTempLimits(),
  baseUrl: resolveTempBaseUrl(),
  enabled: true,
  isDefault: formData.value.isDefault || {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: false, temperature: 0.7 },
  },
  customHeaders: cloneDeep(formData.value.customHeaders || {}),
  useCorsProxy: formData.value.useCorsProxy,
  lastEdited: new Date(),
});

// 将可能为字符串/数字的 token 值解析为非负整数；无法解析时返回 undefined
const parseNonNegativeInt = (value: number | string | undefined | null): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (isNaN(num) || num < 0) return undefined;
  return num;
};

// 从配置结果中抽取有效的 maxInputTokens / maxOutputTokens
const buildAiConfigFromResult = (
  result: AIConfigResult,
): { maxInputTokens?: number; maxOutputTokens?: number } => {
  const config: { maxInputTokens?: number; maxOutputTokens?: number } = {};
  const inputTokens = parseNonNegativeInt(result.maxInputTokens);
  if (inputTokens !== undefined) config.maxInputTokens = inputTokens;
  const outputTokens = parseNonNegativeInt(result.maxOutputTokens);
  if (outputTokens !== undefined) config.maxOutputTokens = outputTokens;
  return config;
};

// 构建测试成功的详情消息（使用原始值进行本地化格式化）
const buildTestDetailMessage = (result: AIConfigResult): string => {
  const details: string[] = [];
  if (result.maxInputTokens && result.maxInputTokens > 0) {
    details.push(`上下文窗口: ${result.maxInputTokens.toLocaleString()}`);
  }
  if (result.maxOutputTokens && result.maxOutputTokens > 0) {
    details.push(`最大输出 Token: ${result.maxOutputTokens.toLocaleString()}`);
  }
  return details.length > 0 ? `${result.message}\n${details.join(', ')}` : result.message;
};

// 处理测试成功：更新配置信息与表单字段，并提示成功
const handleTestSuccess = (result: AIConfigResult) => {
  const config = buildAiConfigFromResult(result);
  aiConfig.value = Object.keys(config).length > 0 ? config : null;

  // 注意：maxInputTokens / maxOutputTokens 为 0 表示无限制，所以只更新大于 0 的值
  if (config.maxInputTokens !== undefined && config.maxInputTokens > 0) {
    formData.value.maxInputTokens = config.maxInputTokens;
  }
  if (config.maxOutputTokens !== undefined && config.maxOutputTokens > 0) {
    formData.value.maxOutputTokens = config.maxOutputTokens;
  }

  // 如果模型信息有更新，更新模型字段
  if (result.modelInfo && result.modelInfo.id !== formData.value.model) {
    formData.value.model = result.modelInfo.id;
  }

  toast.add({
    severity: 'success',
    summary: '测试成功',
    detail: buildTestDetailMessage(result),
    life: 3000,
  });
};

// 测试 AI 模型（获取配置）
const testModel = async () => {
  isTesting.value = true;

  try {
    const result = await ConfigService.getConfig(buildTempModel());

    if (result.success) {
      handleTestSuccess(result);
    } else {
      // 配置获取失败，只显示错误消息
      toast.add({
        severity: 'error',
        summary: '测试失败',
        detail: result.message,
        life: 5000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '测试失败',
      detail: error instanceof Error ? error.message : '获取配置失败：未知错误',
      life: 5000,
    });
  } finally {
    isTesting.value = false;
  }
};

// 处理保存
const handleSave = () => {
  if (!validateForm()) {
    return;
  }
  emit('save', formData.value);
};

const captureSnapshot = () => {
  initialFormSnapshot.value = cloneDeep(formData.value);
};

// 获取可用模型列表的前置条件：必须有 API Key，且非 Gemini 提供商必须有 baseUrl
const canFetchModels = (): boolean => {
  if (!formData.value.apiKey?.trim()) return false;
  if (formData.value.provider !== 'gemini' && !formData.value.baseUrl?.trim()) return false;
  return true;
};

// 构建 getAvailableModels 的请求配置
const buildModelsRequestConfig = (): Parameters<
  (typeof AIServiceFactory)['getAvailableModels']
>[1] => {
  const baseUrl = formData.value.provider === 'gemini' ? undefined : formData.value.baseUrl;
  const config: Parameters<(typeof AIServiceFactory)['getAvailableModels']>[1] = {
    // apiKey 由 canFetchModels() 保证非空
    apiKey: formData.value.apiKey!,
    baseUrl,
    useCorsProxy: formData.value.useCorsProxy,
  };
  if (formData.value.customHeaders && Object.keys(formData.value.customHeaders).length > 0) {
    config.customHeaders = formData.value.customHeaders;
  }
  return config;
};

// 获取可用模型列表
const fetchAvailableModels = async () => {
  if (!canFetchModels()) {
    availableModels.value = [];
    return;
  }

  isLoadingModels.value = true;
  try {
    const result = await AIServiceFactory.getAvailableModels(
      formData.value.provider as AIProvider,
      buildModelsRequestConfig(),
    );
    availableModels.value = result.success && result.models ? result.models : [];
  } catch (error) {
    console.error('获取可用模型列表失败:', error);
    availableModels.value = [];
  } finally {
    isLoadingModels.value = false;
  }
};

// 监听 provider 变化，当切换到 Gemini 时清空 baseUrl
watch(
  () => formData.value.provider,
  (newProvider) => {
    if (newProvider === 'gemini') {
      // 切换到 Gemini 时，清空 baseUrl（服务会使用默认值）
      formData.value.baseUrl = '';
      // 清除 baseUrl 相关的错误
      if (formErrors.value.baseUrl) {
        delete formErrors.value.baseUrl;
      }
    }
    // 切换提供商时，清空模型列表并重新获取
    availableModels.value = [];
    void fetchAvailableModels();
  },
);

// 监听 apiKey 和 baseUrl 变化，自动获取模型列表
watch([() => formData.value.apiKey, () => formData.value.baseUrl], () => {
  // 延迟获取，避免频繁请求
  const timeoutId = setTimeout(() => {
    void fetchAvailableModels();
  }, 500);
  return () => clearTimeout(timeoutId);
});

// 合并单个任务的默认配置，确保 enabled / temperature 字段完整
const mergeTaskDefault = (
  task: { enabled?: boolean; temperature?: number } | undefined,
): { enabled: boolean; temperature: number } => ({
  enabled: task?.enabled ?? false,
  temperature: task?.temperature ?? 0.7,
});

// 编辑模式：根据 props.model 构建 formData，补全缺失字段并合并任务默认值
const buildEditFormData = (model: AIModel): AIModelFormData => {
  const defaultTasks = {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: false, temperature: 0.7 },
  };
  return {
    ...model,
    useCorsProxy: model.useCorsProxy ?? true,
    isDefault: {
      ...defaultTasks,
      ...model.isDefault,
      translation: mergeTaskDefault(model.isDefault.translation),
      proofreading: mergeTaskDefault(model.isDefault.proofreading),
      termsTranslation: mergeTaskDefault(model.isDefault.termsTranslation),
      assistant: mergeTaskDefault(model.isDefault.assistant),
    },
    customHeaders: cloneDeep(model.customHeaders || {}),
  } as AIModelFormData;
};

// 从已保存模型数据填充 aiConfig，用于展示从 AI 获取的配置信息
const initAiConfigFromModel = (model: AIModel) => {
  const config: typeof aiConfig.value = {};
  if (model.maxInputTokens !== undefined && model.maxInputTokens !== null) {
    config.maxInputTokens = model.maxInputTokens;
  }
  if (model.maxOutputTokens !== undefined && model.maxOutputTokens !== null) {
    config.maxOutputTokens = model.maxOutputTokens;
  }
  // 即使只有部分字段，也要设置 aiConfig
  aiConfig.value = config;
};

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      if (props.mode === 'edit' && props.model) {
        // 编辑模式：填充现有数据（补全所有任务配置）
        formData.value = buildEditFormData(props.model);
        initAiConfigFromModel(props.model);
      } else {
        // 添加模式：重置表单
        resetForm();
      }
      formErrors.value = {};
      captureSnapshot();
      syncHeadersToList();
    } else {
      // 关闭时重置
      resetForm();
      showUnsavedCloseConfirm.value = false;
      initialFormSnapshot.value = null;
    }
  },
  { immediate: true },
);

// 自定义 Header 逻辑
const customHeadersList = ref<{ key: string; value: string }[]>([]);

const syncHeadersToList = () => {
  if (formData.value.customHeaders) {
    customHeadersList.value = Object.entries(formData.value.customHeaders).map(([key, value]) => ({
      key,
      value,
    }));
  } else {
    customHeadersList.value = [];
  }
};

const addCustomHeader = () => {
  customHeadersList.value.push({ key: '', value: '' });
  updateCustomHeaders();
};

const removeCustomHeader = (index: number) => {
  customHeadersList.value.splice(index, 1);
  updateCustomHeaders();
};

const updateCustomHeaders = () => {
  const headers: Record<string, string> = {};
  for (const { key, value } of customHeadersList.value) {
    const k = key.trim();
    if (k) {
      headers[k] = value.trim();
    }
  }
  formData.value.customHeaders = headers;
};
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    :header="mode === 'add' ? '添加 AI 模型' : '编辑 AI 模型'"
    desktop-width="750px"
    desktop-height="90vh"
    eyebrow="AI · MODEL"
    :closable="!hasChildDialogOpen"
    :dismissable-mask="!hasChildDialogOpen"
    :close-on-escape="!hasChildDialogOpen"
    :sheet-dismiss-on-mask-click="!hasChildDialogOpen"
    dialog-class="ai-model-dialog"
    @update:visible="handleDialogVisibleChange"
  >
    <div class="space-y-5 py-2">
      <!-- 启用状态 / CORS / 模型名称 / 温度 / 提供商 / API Key / 基础地址 -->
      <AiModelBasicFields :is-browser="isBrowser" />

      <!-- 模型标识（含刷新列表、可用模型提示） -->
      <AiModelSelector
        :model-options="modelOptions"
        :available-models="availableModels"
        :is-loading-models="isLoadingModels"
        @refresh="fetchAvailableModels"
      />

      <!-- AI 配置信息 -->
      <div class="space-y-3 pt-3 border-t border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label class="block text-sm font-medium text-moon/90">AI 配置信息</label>
          <Button
            label="获取配置"
            icon="pi pi-download"
            class="p-button-text p-button-sm icon-button-hover"
            :disabled="canFetchConfigDisabled"
            :loading="isTesting"
            @click="testModel"
          />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AiTokenField
            v-model="formData.maxInputTokens"
            input-id="edit-maxInputTokens"
            label="上下文窗口"
            :max="10000000"
            :error="formErrors.maxInputTokens"
            :ai-config-value="aiConfig?.maxInputTokens"
            ai-hint-label="从 AI 获取的上下文窗口"
          />
          <AiTokenField
            v-model="formData.maxOutputTokens"
            input-id="edit-maxOutputTokens"
            label="最大输出 Token"
            :max="100000000"
            :error="formErrors.maxOutputTokens"
            :ai-config-value="aiConfig?.maxOutputTokens"
            ai-hint-label="从 AI 获取"
          />
        </div>
      </div>

      <!-- 高级选项 (自定义 Headers) -->
      <div class="space-y-4 pt-3 border-t border-white/10">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium text-moon/90">高级选项 (自定义请求头)</label>
          <Button
            label="添加 Header"
            icon="pi pi-plus"
            class="p-button-text p-button-sm icon-button-hover"
            @click="addCustomHeader"
          />
        </div>
        <AiCustomHeaders
          :headers="customHeadersList"
          @change="updateCustomHeaders"
          @remove="removeCustomHeader"
        />
      </div>

      <!-- 默认任务 -->
      <div class="space-y-4 pt-3 border-t border-white/10">
        <label class="block text-sm font-medium text-moon/90 mb-3">默认任务</label>
        <div class="space-y-4">
          <AiTaskDefaultItem
            v-for="task in taskItems"
            :key="task.key"
            v-model:enabled="formData.isDefault[task.key].enabled"
            v-model:temperature="formData.isDefault[task.key].temperature"
            :label="task.label"
            :id-prefix="idPrefix"
            :id-suffix="task.key"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <div class="ai-model-dialog-footer flex w-full gap-2 sm:justify-end">
        <Button
          label="取消"
          icon="pi pi-times"
          class="p-button-text icon-button-hover flex-1 sm:flex-none"
          @click="requestCloseDialog"
        />
        <Button
          label="保存"
          icon="pi pi-check"
          class="p-button-primary icon-button-hover flex-1 sm:flex-none"
          @click="handleSave"
        />
      </div>
    </template>

    <AdaptiveDialog
      v-model:visible="showUnsavedCloseConfirm"
      header="放弃未保存修改？"
      desktop-width="420px"
      eyebrow="UNSAVED"
      sheet-min-height="auto"
    >
      <div class="space-y-3">
        <p class="text-moon/90">当前模型配置有未保存修改，关闭后这些修改将丢失。</p>
      </div>
      <template #footer>
        <Button
          label="继续编辑"
          icon="pi pi-pencil"
          class="p-button-text"
          @click="cancelDiscardAndKeepEditing"
        />
        <Button
          label="放弃修改并关闭"
          icon="pi pi-times"
          class="p-button-danger"
          @click="confirmDiscardAndClose"
        />
      </template>
    </AdaptiveDialog>
  </AdaptiveDialog>
</template>

<style scoped>
:deep(.ai-model-dialog .p-dialog-content) {
  overflow-x: hidden;
}

:deep(.ai-model-dialog .p-inputnumber) {
  width: 100%;
}
</style>
