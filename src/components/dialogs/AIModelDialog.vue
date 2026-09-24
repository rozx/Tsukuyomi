<script setup lang="ts">
import { ref, computed, watch, provide } from 'vue';
import { cloneDeep, isEqual } from 'lodash';
import Button from 'primevue/button';
import Select from 'primevue/select';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import AiModelBasicFields from './AiModelBasicFields.vue';
import AiModelSelector from './AiModelSelector.vue';
import AiTokenField from './AiTokenField.vue';
import AiCustomHeaders from './AiCustomHeaders.vue';
import AiTaskDefaultItem from './AiTaskDefaultItem.vue';
import { useElectron } from 'src/composables/useElectron';
import { useFormDialogCloseGuard } from 'src/composables/dialogs/useUnsavedChangesDialog';
import type { AIModel, AIProvider } from 'src/services/ai/types/ai-model';
import type { ModelInfo } from 'src/services/ai/types/ai-service';
import type { AIModelFormData, TaskDefaultsKey } from './ai-model-form-types';
import { AI_MODEL_FORM_KEY } from './ai-model-form-types';
import { AIServiceFactory } from 'src/services/ai';
import { useModelConfiguration } from 'src/composables/ai-page/useModelConfiguration';

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
const { isBrowser } = useElectron();

// 目录或原有配置中的参考数值。
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
  thinkingLevel: 'provider-default',
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

// models.dev 目录查询不需要凭据。
const canFetchConfigDisabled = computed(
  () => isTesting.value || isFetchingConfig.value || !formData.value.model?.trim(),
);
const limitsSourceLabel = computed(() => {
  switch (formData.value.limitsSource) {
    case 'catalog':
      return '来源：models.dev 模型目录';
    case 'probe':
      return '来源：历史模型自述';
    case 'manual':
      return '来源：手动设置';
    default:
      return '';
  }
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

// 保留当前表单地址；Gemini 地址为空时由 provider 使用默认端点。
const resolveTempBaseUrl = (): string => formData.value.baseUrl || '';

// 构建用于获取配置的临时模型对象
const buildTempModel = (): AIModel => ({
  ...resolveTempIdentity(),
  provider: formData.value.provider as AIProvider,
  ...resolveTempLimits(),
  thinkingLevel: formData.value.thinkingLevel,
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

const { isFetchingConfig, isTesting, availabilityResult, fetchModelInfo, testAvailability } =
  useModelConfiguration({
    source: () => [props.visible, formData.value],
    visible: () => props.visible,
    model: buildTempModel,
    applyCatalog: (result) => {
      aiConfig.value = {
        maxInputTokens: result.maxInputTokens ?? 0,
        maxOutputTokens: result.maxOutputTokens ?? 0,
      };
      Object.assign(formData.value, aiConfig.value, { limitsSource: 'catalog' });
    },
  });
const canTestDisabled = computed(
  () =>
    isTesting.value ||
    isFetchingConfig.value ||
    !formData.value.model?.trim() ||
    !formData.value.apiKey?.trim() ||
    (formData.value.provider !== 'gemini' && !formData.value.baseUrl?.trim()),
);
const thinkingLevels = [
  { label: '默认（跟随模型）', value: 'provider-default' },
  { label: '关闭 / 最低', value: 'none' },
  { label: '极低', value: 'minimal' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '极高', value: 'xhigh' },
];
let initializingForm = false;

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
  const baseUrl = formData.value.baseUrl;
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
    if (initializingForm) return;
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
  { flush: 'sync' },
);

// 监听 apiKey 和 baseUrl 变化，自动获取模型列表
watch(
  [() => formData.value.apiKey, () => formData.value.baseUrl],
  (_value, _previous, onCleanup) => {
    // 延迟获取，避免频繁请求
    const timeoutId = setTimeout(() => {
      void fetchAvailableModels();
    }, 500);
    onCleanup(() => clearTimeout(timeoutId));
  },
);

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
  // 历史数据可能整块缺失 isDefault，先兜底为空对象再展开/合并，避免初始化即报错
  const savedTaskDefaults = model.isDefault ?? {};
  return {
    ...model,
    thinkingLevel: model.thinkingLevel ?? 'provider-default',
    useCorsProxy: model.useCorsProxy ?? true,
    isDefault: {
      ...defaultTasks,
      ...savedTaskDefaults,
      translation: mergeTaskDefault(savedTaskDefaults.translation),
      proofreading: mergeTaskDefault(savedTaskDefaults.proofreading),
      termsTranslation: mergeTaskDefault(savedTaskDefaults.termsTranslation),
      assistant: mergeTaskDefault(savedTaskDefaults.assistant),
    },
    customHeaders: cloneDeep(model.customHeaders || {}),
  } as AIModelFormData;
};

// 记住已保存的数值，供手动编辑时参考。
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
// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  (newVisible) => {
    initializingForm = true;
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
    initializingForm = false;
  },
  { immediate: true },
);
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

      <div class="space-y-2">
        <label for="edit-thinkingLevel" class="block text-sm font-medium text-moon/90"
          >思考等级</label
        >
        <Select
          input-id="edit-thinkingLevel"
          v-model="formData.thinkingLevel"
          :options="thinkingLevels"
          option-label="label"
          option-value="value"
          class="w-full"
        />
        <small class="block text-xs text-moon/60"
          >默认由模型决定；较高等级通常增加耗时和 Token
          消耗。可用等级取决于模型，可通过测试验证。</small
        >
      </div>
      <div class="space-y-2">
        <Button
          label="测试可用性"
          icon="pi pi-bolt"
          outlined
          :loading="isTesting"
          :disabled="canTestDisabled"
          @click="testAvailability"
        />
        <small class="block text-xs text-moon/60"
          >使用当前配置发送一条简短请求，可能产生少量 API 用量。</small
        >
        <div
          v-if="availabilityResult"
          :role="availabilityResult.success ? 'status' : 'alert'"
          class="rounded-lg border border-white/10 p-3 text-sm"
          :class="availabilityResult.success ? 'text-green-400' : 'text-red-400'"
        >
          {{ availabilityResult.message }}
          <span class="text-moon/60">（{{ availabilityResult.durationMs }} ms）</span>
        </div>
      </div>

      <!-- models.dev 模型资料 -->
      <div class="space-y-3 pt-3 border-t border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label class="block text-sm font-medium text-moon/90">模型资料</label>
          <Button
            label="获取模型资料"
            icon="pi pi-download"
            class="p-button-text p-button-sm icon-button-hover"
            :disabled="canFetchConfigDisabled"
            :loading="isFetchingConfig"
            @click="fetchModelInfo"
          />
        </div>
        <p class="text-xs text-moon/60">
          资料来自
          <a href="https://models.dev" target="_blank" rel="noopener noreferrer" class="underline"
            >models.dev</a
          >
          目录；未收录的型号可手动填写。
        </p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AiTokenField
            v-model="formData.maxInputTokens"
            input-id="edit-maxInputTokens"
            label="上下文窗口"
            :max="10000000"
            :error="formErrors.maxInputTokens"
            :ai-config-value="aiConfig?.maxInputTokens"
            ai-hint-label="参考窗口"
            @update:model-value="formData.limitsSource = 'manual'"
          />
          <AiTokenField
            v-model="formData.maxOutputTokens"
            input-id="edit-maxOutputTokens"
            label="最大输出 Token"
            :max="100000000"
            :error="formErrors.maxOutputTokens"
            :ai-config-value="aiConfig?.maxOutputTokens"
            ai-hint-label="参考上限"
            @update:model-value="formData.limitsSource = 'manual'"
          />
        </div>
        <small v-if="limitsSourceLabel" class="block text-xs text-moon/70">{{
          limitsSourceLabel
        }}</small>
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
