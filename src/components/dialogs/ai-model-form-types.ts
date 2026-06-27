import type { InjectionKey, Ref, ComputedRef } from 'vue';
import type { AIModel } from 'src/services/ai/types/ai-model';

// AI 模型表单数据类型（Partial<AIModel> 并保证 isDefault 字段存在）
export type AIModelFormData = Partial<AIModel> & { isDefault: AIModel['isDefault'] };

// 默认任务的四个键
export type TaskDefaultsKey = 'translation' | 'proofreading' | 'termsTranslation' | 'assistant';

// 单个任务的默认配置（启用状态 + 温度）
export interface TaskDefault {
  enabled: boolean;
  temperature: number;
}

// 自定义请求头列表项
export interface CustomHeaderItem {
  key: string;
  value: string;
}

// 子组件共享的表单上下文（通过 provide/inject 传递，避免 prop 突变告警）
export interface AiModelFormContext {
  formData: Ref<AIModelFormData>;
  formErrors: Ref<Record<string, string>>;
  idPrefix: ComputedRef<string>;
}

export const AI_MODEL_FORM_KEY: InjectionKey<AiModelFormContext> = Symbol('aiModelForm');
