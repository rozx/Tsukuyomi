<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import Checkbox from 'primevue/checkbox';
import InputSwitch from 'primevue/inputswitch';
import Slider from 'primevue/slider';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { AIModel, AIProvider } from 'src/types/ai/ai-model';
import { AIServiceFactory } from 'src/services/ai';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode: 'add' | 'edit';
    model?: AIModel | null;
  }>(),
  {
    model: null,
  }
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<AIModel> & { isDefault: AIModel['isDefault'] }];
  cancel: [];
}>();

const idPrefix = computed(() => props.mode === 'add' ? '' : 'edit');
const toast = useToastWithHistory();

// 测试相关状态
const isTesting = ref(false);

// 从 AI 获取的配置信息（只读）
const aiConfig = ref<{
  maxTokens?: number;
  contextWindow?: number;
} | null>(null);

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
    polishing: { enabled: false, temperature: 0.7 },
    characterExtraction: { enabled: false, temperature: 0.7 },
    terminologyExtraction: { enabled: false, temperature: 0.7 },
  },
});

// 表单验证错误
const formErrors = ref<Record<string, string>>({});

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
      polishing: { enabled: false, temperature: 0.7 },
      characterExtraction: { enabled: false, temperature: 0.7 },
      terminologyExtraction: { enabled: false, temperature: 0.7 },
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

  if (formData.value.temperature === undefined || formData.value.temperature < 0 || formData.value.temperature > 2) {
    formErrors.value.temperature = '温度值必须在 0-2 之间';
  }

  // maxTokens 为 0 表示无限制，不需要验证
  if (formData.value.maxTokens === undefined || formData.value.maxTokens < 0) {
    formErrors.value.maxTokens = '最大 Token 数不能为负数';
  }

  return Object.keys(formErrors.value).length === 0;
};

// 测试 AI 模型（获取配置）
const testModel = async () => {
  if (!formData.value.apiKey?.trim() || !formData.value.model?.trim()) {
    toast.add({
      severity: 'warn',
      summary: '提示',
      detail: '请先填写 API Key 和模型标识',
      life: 3000,
    });
    return;
  }

  // Gemini 不需要 baseUrl，其他提供商需要
  if (formData.value.provider !== 'gemini' && !formData.value.baseUrl?.trim()) {
    toast.add({
      severity: 'warn',
      summary: '提示',
      detail: '请先填写 API Key、基础地址和模型标识',
      life: 3000,
    });
    return;
  }

  isTesting.value = true;

  try {
    // Gemini 使用默认 baseUrl，其他提供商使用用户输入的 baseUrl
    const baseUrl = formData.value.provider === 'gemini'
      ? undefined
      : formData.value.baseUrl;

    const result = await AIServiceFactory.getConfig(formData.value.provider as AIProvider, {
      apiKey: formData.value.apiKey!,
      baseUrl: baseUrl,
      model: formData.value.model!,
      temperature: formData.value.temperature,
      maxTokens: formData.value.maxTokens,
    });

    // 保存从 AI 获取的配置信息
    const config: typeof aiConfig.value = {};

    // 确保 maxTokens 是数字类型
    if (result.maxTokens !== undefined && result.maxTokens !== null) {
      const maxTokensValue = typeof result.maxTokens === 'number'
        ? result.maxTokens
        : parseInt(String(result.maxTokens), 10);
      if (!isNaN(maxTokensValue) && maxTokensValue >= 0) {
        config.maxTokens = maxTokensValue;
      }
    }

    // 确保 contextWindow 是数字类型
    if (result.modelInfo?.contextWindow !== undefined && result.modelInfo.contextWindow !== null) {
      const contextWindowValue = typeof result.modelInfo.contextWindow === 'number'
        ? result.modelInfo.contextWindow
        : parseInt(String(result.modelInfo.contextWindow), 10);
      if (!isNaN(contextWindowValue) && contextWindowValue > 0) {
        config.contextWindow = contextWindowValue;
      }
    }

    aiConfig.value = Object.keys(config).length > 0 ? config : null;

    // 如果获取到 maxTokens，自动更新表单字段（确保是数字）
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

    const detailMessage = details.length > 0 ? `${result.message}\n${details.join(', ')}` : result.message;

    toast.add({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? '测试成功' : '测试失败',
      detail: detailMessage,
      life: result.success ? 3000 : 5000,
    });
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

// 处理取消
const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};

// 获取上下文窗口显示值
const getContextWindowDisplay = (): string => {
  const value = formData.value.contextWindow ?? aiConfig.value?.contextWindow;
  if (value !== undefined && value !== null && typeof value === 'number' && value > 0) {
    return value.toLocaleString();
  }
  return '-';
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
  }
);

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      if (props.mode === 'edit' && props.model) {
        // 编辑模式：填充现有数据
        formData.value = {
          ...props.model,
          isDefault: { ...props.model.isDefault },
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
    } else {
      // 关闭时重置
      resetForm();
    }
  },
  { immediate: true }
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="mode === 'add' ? '添加 AI 模型' : '编辑 AI 模型'"
    :modal="true"
    :style="{ width: '750px' }"
    :closable="true"
    class="ai-model-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="space-y-5 py-2">
      <!-- 启用状态 -->
      <div class="flex items-center justify-between py-3 px-3 bg-white/5 rounded-lg border border-white/10">
        <label :for="`${idPrefix}-enabled`" class="block text-sm font-medium text-moon/90">启用模型</label>
        <InputSwitch :id="`${idPrefix}-enabled`" v-model="formData.enabled" />
      </div>

      <!-- 模型名称 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-name`" class="block text-sm font-medium text-moon/90">模型名称 *</label>
        <InputText
          :id="`${idPrefix}-name`"
          v-model="formData.name"
          placeholder="例如: GPT-4 翻译模型"
          class="w-full"
          :class="{ 'p-invalid': formErrors.name }"
        />
        <small v-if="formErrors.name" class="p-error block mt-1">{{ formErrors.name }}</small>
      </div>

      <!-- 提供商 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-provider`" class="block text-sm font-medium text-moon/90">提供商 *</label>
        <Dropdown
          :id="`${idPrefix}-provider`"
          v-model="formData.provider"
          :options="providerOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="选择提供商"
          class="w-full"
        />
      </div>

      <!-- 模型标识 -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-model`" class="block text-sm font-medium text-moon/90">模型标识 *</label>
        <InputText
          :id="`${idPrefix}-model`"
          v-model="formData.model"
          placeholder="例如: gpt-4, gemini-pro"
          class="w-full"
          :class="{ 'p-invalid': formErrors.model }"
        />
        <small v-if="formErrors.model" class="p-error block mt-1">{{ formErrors.model }}</small>
      </div>

      <!-- 温度 -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label :for="`${idPrefix}-temperature`" class="block text-sm font-medium text-moon/90">温度 (0-2) *</label>
          <span class="text-sm font-medium text-primary px-2 py-0.5 bg-primary/10 rounded">{{ formData.temperature }}</span>
        </div>
        <Slider
          :id="`${idPrefix}-temperature`"
          v-model="formData.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          class="w-full mt-2"
        />
        <small v-if="formErrors.temperature" class="p-error block mt-1">{{ formErrors.temperature }}</small>
      </div>

      <!-- API Key -->
      <div class="space-y-2">
        <label :for="`${idPrefix}-apiKey`" class="block text-sm font-medium text-moon/90">API Key *</label>
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
        <label :for="`${idPrefix}-baseUrl`" class="block text-sm font-medium text-moon/90">基础地址 *</label>
        <InputText
          :id="`${idPrefix}-baseUrl`"
          v-model="formData.baseUrl"
          placeholder="例如: https://api.openai.com/v1"
          class="w-full"
          :class="{ 'p-invalid': formErrors.baseUrl }"
        />
        <small v-if="formErrors.baseUrl" class="p-error block mt-1">{{ formErrors.baseUrl }}</small>
      </div>

      <!-- AI 配置信息（只读） -->
      <div class="space-y-3 pt-3 border-t border-white/10">
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium text-moon/90">AI 配置信息（只读）</label>
          <Button
            label="获取配置"
            icon="pi pi-download"
            class="p-button-text p-button-sm icon-button-hover"
            :disabled="isTesting || !formData.apiKey?.trim() || !formData.model?.trim() || (formData.provider !== 'gemini' && !formData.baseUrl?.trim())"
            :loading="isTesting"
            @click="testModel"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-moon/70">最大输入 Token</label>
            <InputText
              :value="(formData.maxTokens ?? 0) === 0 ? '无限制' : (formData.maxTokens ?? 0).toLocaleString()"
              disabled
              class="w-full"
            />
            <small v-if="aiConfig?.maxTokens && aiConfig.maxTokens > 0 && formData.maxTokens !== aiConfig.maxTokens" class="text-xs text-moon/70 block mt-1">
              从 AI 获取: {{ aiConfig.maxTokens.toLocaleString() }}
            </small>
          </div>
          <div class="space-y-1">
            <label class="text-xs text-moon/70">上下文窗口</label>
            <InputText
              :value="getContextWindowDisplay()"
              disabled
              class="w-full"
            />
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
                @click="formData.isDefault.translation.enabled = !formData.isDefault.translation.enabled"
              >
                <Checkbox
                  :id="`${idPrefix}-default-translation`"
                  v-model="formData.isDefault.translation.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-translation`" class="ml-2 text-sm cursor-pointer">翻译</label>
              </div>
              <span v-if="formData.isDefault.translation.enabled" class="text-sm font-medium text-primary px-2 py-0.5 bg-primary/10 rounded">
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
                @click="formData.isDefault.proofreading.enabled = !formData.isDefault.proofreading.enabled"
              >
                <Checkbox
                  :id="`${idPrefix}-default-proofreading`"
                  v-model="formData.isDefault.proofreading.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-proofreading`" class="ml-2 text-sm cursor-pointer">校对</label>
              </div>
              <span v-if="formData.isDefault.proofreading.enabled" class="text-sm font-medium text-primary px-2 py-0.5 bg-primary/10 rounded">
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

          <!-- 润色 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="formData.isDefault.polishing.enabled = !formData.isDefault.polishing.enabled"
              >
                <Checkbox
                  :id="`${idPrefix}-default-polishing`"
                  v-model="formData.isDefault.polishing.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-polishing`" class="ml-2 text-sm cursor-pointer">润色</label>
              </div>
              <span v-if="formData.isDefault.polishing.enabled" class="text-sm font-medium text-primary px-2 py-0.5 bg-primary/10 rounded">
                {{ formData.isDefault.polishing.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.polishing.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-polishing`"
                v-model="formData.isDefault.polishing.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                class="w-full"
              />
            </div>
          </div>

          <!-- 角色提取 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="formData.isDefault.characterExtraction.enabled = !formData.isDefault.characterExtraction.enabled"
              >
                <Checkbox
                  :id="`${idPrefix}-default-characterExtraction`"
                  v-model="formData.isDefault.characterExtraction.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-characterExtraction`" class="ml-2 text-sm cursor-pointer">角色提取</label>
              </div>
              <span v-if="formData.isDefault.characterExtraction.enabled" class="text-sm font-medium text-primary px-2 py-0.5 bg-primary/10 rounded">
                {{ formData.isDefault.characterExtraction.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.characterExtraction.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-characterExtraction`"
                v-model="formData.isDefault.characterExtraction.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                class="w-full"
              />
            </div>
          </div>

          <!-- 术语提取 -->
          <div class="p-3 rounded-lg border border-white/10 bg-white/5">
            <div class="flex items-center justify-between mb-3">
              <div
                class="flex items-center cursor-pointer"
                @click="formData.isDefault.terminologyExtraction.enabled = !formData.isDefault.terminologyExtraction.enabled"
              >
                <Checkbox
                  :id="`${idPrefix}-default-terminologyExtraction`"
                  v-model="formData.isDefault.terminologyExtraction.enabled"
                  :binary="true"
                  @click.stop
                />
                <label :for="`${idPrefix}-default-terminologyExtraction`" class="ml-2 text-sm cursor-pointer">术语提取</label>
              </div>
              <span v-if="formData.isDefault.terminologyExtraction.enabled" class="text-sm font-medium text-primary px-2 py-0.5 bg-primary/10 rounded">
                {{ formData.isDefault.terminologyExtraction.temperature }}
              </span>
            </div>
            <div v-if="formData.isDefault.terminologyExtraction.enabled" class="mt-2">
              <Slider
                :id="`${idPrefix}-temperature-terminologyExtraction`"
                v-model="formData.isDefault.terminologyExtraction.temperature"
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
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text icon-button-hover"
        @click="handleCancel"
      />
      <Button label="保存" icon="pi pi-check" class="p-button-primary icon-button-hover" @click="handleSave" />
    </template>
  </Dialog>
</template>
