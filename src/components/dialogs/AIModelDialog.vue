<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { cloneDeep, isEqual } from 'lodash';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import ToggleSwitch from 'primevue/toggleswitch';
import Slider from 'primevue/slider';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAdaptiveDialog } from 'src/composables/useAdaptiveDialog';
import type { AIModel, AIProvider } from 'src/services/ai/types/ai-model';
import type { ModelInfo } from 'src/services/ai/types/ai-service';
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
const { dialogStyle, dialogClass, isPhone } = useAdaptiveDialog({
  desktopWidth: '750px',
  tabletWidth: '94vw',
  desktopHeight: '90vh',
  tabletHeight: '94vh',
});
const unsavedConfirmDialogStyle = computed(() =>
  isPhone.value
    ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
    : { width: '420px' },
);
const unsavedConfirmDialogClass = computed(() =>
  isPhone.value ? 'adaptive-dialog-fullscreen' : '',
);

// 测试相关状态
const isTesting = ref(false);

// 从 AI 获取的配置信息（只读）
const aiConfig = ref<{
  maxTokens?: number;
  contextWindow?: number;
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

// 表单数据
const formData = ref<Partial<AIModel> & { isDefault: AIModel['isDefault'] }>({
  name: '',
  provider: 'openai',
  model: '',
  temperature: 0.7,
  maxTokens: 0, // 0 表示无限制
  apiKey: '',
  baseUrl: '',
  enabled: true,
  isDefault: {
    translation: { enabled: false, temperature: 0.7 },
    proofreading: { enabled: false, temperature: 0.7 },
    termsTranslation: { enabled: false, temperature: 0.7 },
    assistant: { enabled: false, temperature: 0.7 },
  },
});

// 表单验证错误
const formErrors = ref<Record<string, string>>({});
const showUnsavedCloseConfirm = ref(false);
const initialFormSnapshot = ref<(Partial<AIModel> & { isDefault: AIModel['isDefault'] }) | null>(
  null,
);

const hasUnsavedChanges = computed(() => {
  if (!props.visible || !initialFormSnapshot.value) {
    return false;
  }
  return !isEqual(initialFormSnapshot.value, formData.value);
});

const hasChildDialogOpen = computed(() => showUnsavedCloseConfirm.value);

// 提供商选项
const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Gemini', value: 'gemini' },
];

// 重置表单
const resetForm = () => {
  formData.value = {
    name: '',
    provider: 'openai',
    model: '',
    temperature: 0.7,
    maxTokens: 0, // 0 表示无限制
    apiKey: '',
    baseUrl: '',
    enabled: true,
    isDefault: {
      translation: { enabled: false, temperature: 0.7 },
      proofreading: { enabled: false, temperature: 0.7 },
      termsTranslation: { enabled: false, temperature: 0.7 },
      assistant: { enabled: false, temperature: 0.7 },
    },
  } as typeof formData.value;
  formErrors.value = {};
  aiConfig.value = null;
};

// 验证表单
const validateForm = (): boolean => {
  formErrors.value = {};

  if (!formData.value.name?.trim()) {
    formErrors.value.name = '模型名称不能为空';
  }

  if (!formData.value.model?.trim()) {
    formErrors.value.model = '模型标识不能为空';
  }

  if (!formData.value.apiKey?.trim()) {
    formErrors.value.apiKey = 'API Key 不能为空';
  }

  // Gemini 不需要 baseUrl，其他提供商需要
  if (formData.value.provider !== 'gemini' && !formData.value.baseUrl?.trim()) {
    formErrors.value.baseUrl = '基础地址不能为空';
  }

  if (
    formData.value.temperature === undefined ||
    formData.value.temperature < 0 ||
    formData.value.temperature > 2
  ) {
    formErrors.value.temperature = '温度值必须在 0-2 之间';
  }

  // maxTokens 为 0 表示无限制，不需要验证
  if (formData.value.maxTokens === undefined || formData.value.maxTokens < 0) {
    formErrors.value.maxTokens = '最大 Token 数不能为负数';
  }

  // contextWindow 为可选字段，如果提供则必须大于 0
  if (
    formData.value.contextWindow !== undefined &&
    formData.value.contextWindow !== null &&
    formData.value.contextWindow <= 0
  ) {
    formErrors.value.contextWindow = '上下文窗口必须大于 0';
  }

  return Object.keys(formErrors.value).length === 0;
};

// 测试 AI 模型（获取配置）
const testModel = async () => {
  isTesting.value = true;

  try {
    // 构建临时模型对象用于配置获取
    const tempModel: AIModel = {
      id: props.model?.id || 'temp',
      name: formData.value.name || '临时模型',
      provider: formData.value.provider as AIProvider,
      model: formData.value.model || '',
      temperature: formData.value.temperature ?? 0.7,
      maxTokens: formData.value.maxTokens ?? 0,
      apiKey: formData.value.apiKey || '',
      baseUrl: formData.value.provider === 'gemini' ? '' : formData.value.baseUrl || '',
      enabled: true,
      isDefault: formData.value.isDefault || {
        translation: { enabled: false, temperature: 0.7 },
        proofreading: { enabled: false, temperature: 0.7 },
        termsTranslation: { enabled: false, temperature: 0.7 },
        assistant: { enabled: false, temperature: 0.7 },
      },
      lastEdited: new Date(),
    };

    const result = await ConfigService.getConfig(tempModel);

    // 只有在成功时才处理配置信息
    if (result.success) {
      // 保存从 AI 获取的配置信息
      const config: typeof aiConfig.value = {};

      // 确保 maxTokens 是数字类型
      if (result.maxTokens !== undefined && result.maxTokens !== null) {
        const maxTokensValue =
          typeof result.maxTokens === 'number'
            ? result.maxTokens
            : parseInt(String(result.maxTokens), 10);
        if (!isNaN(maxTokensValue) && maxTokensValue >= 0) {
          config.maxTokens = maxTokensValue;
        }
      }

      // 确保 contextWindow 是数字类型
      if (
        result.modelInfo?.contextWindow !== undefined &&
        result.modelInfo.contextWindow !== null
      ) {
        const contextWindowValue =
          typeof result.modelInfo.contextWindow === 'number'
            ? result.modelInfo.contextWindow
            : parseInt(String(result.modelInfo.contextWindow), 10);
        if (!isNaN(contextWindowValue) && contextWindowValue > 0) {
          config.contextWindow = contextWindowValue;
        }
      }

      aiConfig.value = Object.keys(config).length > 0 ? config : null;

      // 如果获取到 maxTokens，自动更新表单字段（确保是数字）
      // 注意：maxTokens 为 0 表示无限制，所以只更新大于 0 的值
      if (config.maxTokens !== undefined && config.maxTokens > 0) {
        formData.value.maxTokens = config.maxTokens;
      }

      // 如果获取到 contextWindow，自动更新表单字段（确保是数字）
      if (config.contextWindow !== undefined && config.contextWindow > 0) {
        formData.value.contextWindow = config.contextWindow;
      }

      // 如果模型信息有更新，更新模型字段
      if (result.modelInfo && result.modelInfo.id !== formData.value.model) {
        formData.value.model = result.modelInfo.id;
      }

      // 构建详细信息
      const details: string[] = [];
      if (result.maxTokens && result.maxTokens > 0) {
        details.push(`最大 Token: ${result.maxTokens.toLocaleString()}`);
      }

      const detailMessage =
        details.length > 0 ? `${result.message}\n${details.join(', ')}` : result.message;

      toast.add({
        severity: 'success',
        summary: '测试成功',
        detail: detailMessage,
        life: 3000,
      });
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

const closeDialogImmediately = () => {
  emit('cancel');
  emit('update:visible', false);
};

const requestCloseDialog = () => {
  if (hasUnsavedChanges.value) {
    showUnsavedCloseConfirm.value = true;
    return;
  }
  closeDialogImmediately();
};

const confirmDiscardAndClose = () => {
  showUnsavedCloseConfirm.value = false;
  closeDialogImmediately();
};

const cancelDiscardAndKeepEditing = () => {
  showUnsavedCloseConfirm.value = false;
};

const handleDialogVisibleChange = (nextVisible: boolean) => {
  if (nextVisible) {
    emit('update:visible', true);
    return;
  }
  requestCloseDialog();
};

// 获取可用模型列表
const fetchAvailableModels = async () => {
  // 需要 API Key 才能获取模型列表
  if (!formData.value.apiKey?.trim()) {
    availableModels.value = [];
    return;
  }

  // Gemini 不需要 baseUrl，其他提供商需要
  if (formData.value.provider !== 'gemini' && !formData.value.baseUrl?.trim()) {
    availableModels.value = [];
    return;
  }

  isLoadingModels.value = true;
  try {
    const baseUrl = formData.value.provider === 'gemini' ? undefined : formData.value.baseUrl;

    const result = await AIServiceFactory.getAvailableModels(
      formData.value.provider as AIProvider,
      {
        apiKey: formData.value.apiKey,
        baseUrl: baseUrl,
      },
    );

    if (result.success && result.models) {
      availableModels.value = result.models;
    } else {
      availableModels.value = [];
    }
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

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      if (props.mode === 'edit' && props.model) {
        // 编辑模式：填充现有数据
        // 确保所有任务配置都存在
        const defaultTasks: typeof formData.value.isDefault = {
          translation: { enabled: false, temperature: 0.7 },
          proofreading: { enabled: false, temperature: 0.7 },
          termsTranslation: { enabled: false, temperature: 0.7 },
          assistant: { enabled: false, temperature: 0.7 },
        };

        // 合并现有数据，确保新字段有默认值
        formData.value = {
          ...props.model,
          isDefault: {
            ...defaultTasks,
            ...props.model.isDefault,
            // 确保每个任务配置都有完整的结构
            translation: {
              enabled: props.model.isDefault.translation?.enabled ?? false,
              temperature: props.model.isDefault.translation?.temperature ?? 0.7,
            },
            proofreading: {
              enabled: props.model.isDefault.proofreading?.enabled ?? false,
              temperature: props.model.isDefault.proofreading?.temperature ?? 0.7,
            },
            termsTranslation: {
              enabled: props.model.isDefault.termsTranslation?.enabled ?? false,
              temperature: props.model.isDefault.termsTranslation?.temperature ?? 0.7,
            },
            assistant: {
              enabled: props.model.isDefault.assistant?.enabled ?? false,
              temperature: props.model.isDefault.assistant?.temperature ?? 0.7,
            },
          },
        } as typeof formData.value;

        // 从已保存的模型数据中填充 aiConfig，以便显示
        const config: typeof aiConfig.value = {};
        if (props.model.maxTokens !== undefined && props.model.maxTokens !== null) {
          config.maxTokens = props.model.maxTokens;
        }
        if (props.model.contextWindow !== undefined && props.model.contextWindow !== null) {
          config.contextWindow = props.model.contextWindow;
        }
        // 即使只有部分字段，也要设置 aiConfig
        aiConfig.value = config;
      } else {
        // 添加模式：重置表单
        resetForm();
      }
      formErrors.value = {};
      captureSnapshot();
    } else {
      // 关闭时重置
      resetForm();
      showUnsavedCloseConfirm.value = false;
      initialFormSnapshot.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="mode === 'add' ? '添加 AI 模型' : '编辑 AI 模型'"
    :modal="true"
    :style="dialogStyle"
    :closable="!hasChildDialogOpen"
    :dismissableMask="!hasChildDialogOpen"
    :closeOnEscape="!hasChildDialogOpen"
    :class="['ai-model-dialog', dialogClass]"
    @update:visible="handleDialogVisibleChange"
  >
    <div class="space-y-5 py-2">
      <!-- 启用状态 -->
      <div
        class="flex items-center justify-between py-3 px-3 bg-white/5 rounded-lg border border-white/10"
      >
        <label :for="`${idPrefix}-enabled`" class="block text-sm font-medium text-moon/90"
          >启用模型</label
        >
        <ToggleSwitch :id="`${idPrefix}-enabled`" v-model="formData.enabled" />
      </div>

      <!-- 模型名称 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-name`" class="block text-sm font-medium text-moon/90"
          >模型名称 *</label
        >
        <InputText
          :id="`${idPrefix}-name`"
          v-model="formData.name"
          placeholder="例如: GPT-4 翻译模型"
          class="w-full"
          :class="{ 'p-invalid': formErrors.name }"
        />
        <small v-if="formErrors.name" class="p-error block mt-1">{{ formErrors.name }}</small>
      </div>

      <!-- 温度 -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label :for="`${idPrefix}-temperature`" class="block text-sm font-medium text-moon/90"
            >温度 (0-2) *</label
          >
          <span class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded">{{
            formData.temperature
          }}</span>
        </div>
        <Slider
          :id="`${idPrefix}-temperature`"
          v-model="formData.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          class="w-full mt-2"
        />
        <small v-if="formErrors.temperature" class="p-error block mt-1">{{
          formErrors.temperature
        }}</small>
      </div>

      <!-- 提供商 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-provider`" class="block text-sm font-medium text-moon/90"
          >提供商 *</label
        >
        <Select
          :id="`${idPrefix}-provider`"
          v-model="formData.provider"
          :options="providerOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="选择提供商"
          class="w-full"
        />
      </div>

      <!-- API Key -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-apiKey`" class="block text-sm font-medium text-moon/90"
          >API Key *</label
        >
        <InputText
          :id="`${idPrefix}-apiKey`"
          v-model="formData.apiKey"
          type="password"
          placeholder="输入 API Key"
          class="w-full"
          :class="{ 'p-invalid': formErrors.apiKey }"
        />
        <small v-if="formErrors.apiKey" class="p-error block mt-1">{{ formErrors.apiKey }}</small>
      </div>

      <!-- 基础地址（Gemini 不需要） -->
      <div v-if="formData.provider !== 'gemini'" class="space-y-2">
        <label :for="`${idPrefix}-baseUrl`" class="block text-sm font-medium text-moon/90"
          >基础地址 *</label
        >
        <InputText
          :id="`${idPrefix}-baseUrl`"
          v-model="formData.baseUrl"
          placeholder="例如: https://api.openai.com/v1"
          class="w-full"
          :class="{ 'p-invalid': formErrors.baseUrl }"
        />
        <small v-if="formErrors.baseUrl" class="p-error block mt-1">{{ formErrors.baseUrl }}</small>
      </div>

      <!-- 模型标识 -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label :for="`${idPrefix}-model`" class="block text-sm font-medium text-moon/90"
            >模型标识 *</label
          >
          <Button
            v-if="
              formData.apiKey?.trim() &&
              (formData.provider === 'gemini' || formData.baseUrl?.trim())
            "
            label="刷新列表"
            icon="pi pi-refresh"
            class="p-button-text p-button-sm icon-button-hover"
            :loading="isLoadingModels"
            @click="fetchAvailableModels"
          />
        </div>
        <Select
          :id="`${idPrefix}-model`"
          v-model="formData.model"
          :options="modelOptions"
          optionLabel="label"
          optionValue="value"
          :editable="true"
          :loading="isLoadingModels"
          placeholder="例如: gpt-4, gemini-pro"
          class="w-full"
          :class="{ 'p-invalid': formErrors.model }"
          filter
        >
          <template #option="slotProps">
            <div class="flex flex-col">
              <span class="font-medium">{{ slotProps.option.label }}</span>
              <span
                v-if="slotProps.option.value !== slotProps.option.label"
                class="text-xs text-moon/60"
                >{{ slotProps.option.value }}</span
              >
            </div>
          </template>
        </Select>
        <small v-if="formErrors.model" class="p-error block mt-1">{{ formErrors.model }}</small>
        <small v-if="availableModels.length > 0" class="text-moon/60 text-xs block mt-1">
          找到 {{ availableModels.length }} 个可用模型
        </small>
      </div>

      <!-- AI 配置信息 -->
      <div class="space-y-3 pt-3 border-t border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label class="block text-sm font-medium text-moon/90">AI 配置信息</label>
          <Button
            label="获取配置"
            icon="pi pi-download"
            class="p-button-text p-button-sm icon-button-hover"
            :disabled="
              isTesting ||
              !formData.apiKey?.trim() ||
              !formData.model?.trim() ||
              (formData.provider !== 'gemini' && !formData.baseUrl?.trim())
            "
            :loading="isTesting"
            @click="testModel"
          />
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <label class="text-xs text-moon/70">最大输入 Token</label>
            <InputNumber
              v-model="formData.maxTokens"
              :min="0"
              :max="10000000"
              :use-grouping="true"
              :show-buttons="false"
              placeholder="0 表示无限制"
              class="w-full"
              :class="{ 'p-invalid': formErrors.maxTokens }"
            />
            <small v-if="formErrors.maxTokens" class="p-error block mt-1">{{
              formErrors.maxTokens
            }}</small>
            <small
              v-else-if="
                aiConfig?.maxTokens &&
                aiConfig.maxTokens > 0 &&
                formData.maxTokens !== aiConfig.maxTokens
              "
              class="text-xs text-moon/70 block mt-1"
            >
              从 AI 获取: {{ aiConfig.maxTokens.toLocaleString() }}
            </small>
            <small
              v-else-if="(formData.maxTokens ?? 0) === 0"
              class="text-xs text-moon/70 block mt-1"
            >
              0 表示无限制
            </small>
          </div>
          <div class="space-y-1">
            <label class="text-xs text-moon/70">上下文窗口</label>
            <InputNumber
              v-model="formData.contextWindow"
              :min="1"
              :max="100000000"
              :use-grouping="true"
              :show-buttons="false"
              placeholder="可选，总上下文窗口大小"
              class="w-full"
              :class="{ 'p-invalid': formErrors.contextWindow }"
            />
            <small v-if="formErrors.contextWindow" class="p-error block mt-1">{{
              formErrors.contextWindow
            }}</small>
            <small
              v-else-if="
                aiConfig?.contextWindow &&
                aiConfig.contextWindow > 0 &&
                formData.contextWindow !== aiConfig.contextWindow
              "
              class="text-xs text-moon/70 block mt-1"
            >
              从 AI 获取: {{ aiConfig.contextWindow.toLocaleString() }}
            </small>
            <small v-else-if="!formData.contextWindow" class="text-xs text-moon/70 block mt-1">
              可选字段
            </small>
          </div>
        </div>
      </div>

      <!-- 默认任务 -->
      <div class="space-y-4 pt-3 border-t border-white/10">
        <label class="block text-sm font-medium text-moon/90 mb-3">默认任务</label>
        <div class="space-y-4">
          <!-- 翻译 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="
                  formData.isDefault.translation.enabled = !formData.isDefault.translation.enabled
                "
              >
                <Checkbox
                  :id="`${idPrefix}-default-translation`"
                  v-model="formData.isDefault.translation.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-translation`" class="ml-2 text-sm cursor-pointer"
                  >翻译</label
                >
              </div>
              <span
                v-if="formData.isDefault.translation.enabled"
                class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded"
              >
                {{ formData.isDefault.translation.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.translation.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-translation`"
                v-model="formData.isDefault.translation.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                class="w-full"
              />
            </div>
          </div>

          <!-- 校对 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="
                  formData.isDefault.proofreading.enabled = !formData.isDefault.proofreading.enabled
                "
              >
                <Checkbox
                  :id="`${idPrefix}-default-proofreading`"
                  v-model="formData.isDefault.proofreading.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-proofreading`" class="ml-2 text-sm cursor-pointer"
                  >校对/润色</label
                >
              </div>
              <span
                v-if="formData.isDefault.proofreading.enabled"
                class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded"
              >
                {{ formData.isDefault.proofreading.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.proofreading.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-proofreading`"
                v-model="formData.isDefault.proofreading.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                class="w-full"
              />
            </div>
          </div>

          <!-- 术语翻译 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="
                  formData.isDefault.termsTranslation.enabled =
                    !formData.isDefault.termsTranslation.enabled
                "
              >
                <Checkbox
                  :id="`${idPrefix}-default-termsTranslation`"
                  v-model="formData.isDefault.termsTranslation.enabled"
                  :binary="true"
                  @click.stop
                />
                <label
                  :for="`${idPrefix}-default-termsTranslation`"
                  class="ml-2 text-sm cursor-pointer"
                  >术语翻译 / 章节摘要</label
                >
              </div>
              <span
                v-if="formData.isDefault.termsTranslation?.enabled"
                class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded"
              >
                {{ formData.isDefault.termsTranslation?.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.termsTranslation?.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-termsTranslation`"
                v-model="formData.isDefault.termsTranslation.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                class="w-full"
              />
            </div>
          </div>

          <!-- 助手 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="
                  formData.isDefault.assistant.enabled = !formData.isDefault.assistant.enabled
                "
              >
                <Checkbox
                  :id="`${idPrefix}-default-assistant`"
                  v-model="formData.isDefault.assistant.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-assistant`" class="ml-2 text-sm cursor-pointer"
                  >助手</label
                >
              </div>
              <span
                v-if="formData.isDefault.assistant.enabled"
                class="text-sm font-medium text-accent-400 px-2 py-0.5 bg-accent-400/10 rounded"
              >
                {{ formData.isDefault.assistant.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.assistant.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-assistant`"
                v-model="formData.isDefault.assistant.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                class="w-full"
              />
            </div>
          </div>
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

    <Dialog
      v-model:visible="showUnsavedCloseConfirm"
      header="放弃未保存修改？"
      :modal="true"
      :style="unsavedConfirmDialogStyle"
      :class="unsavedConfirmDialogClass"
      :dismissableMask="true"
      :closeOnEscape="true"
    >
      <div class="space-y-3">
        <p class="text-moon/90">当前模型配置有未保存修改，关闭后这些修改将丢失。</p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
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
        </div>
      </template>
    </Dialog>
  </Dialog>
</template>

<style scoped>
:deep(.ai-model-dialog .p-dialog-content) {
  overflow-x: hidden;
}

:deep(.ai-model-dialog .p-inputnumber) {
  width: 100%;
}
</style>
