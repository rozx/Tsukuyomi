<script setup lang="ts">
import { ref } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useAIModelsStore } from 'src/stores/ai-models';
import type { Settings } from 'src/types/settings';
import type { AIModel } from 'src/types/ai/ai-model';

const props = withDefaults(
  defineProps<{
    visible: boolean;
  }>(),
  {}
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const aiModelsStore = useAIModelsStore();
const toast = useToastWithHistory();

// 隐藏的文件输入
const fileInputRef = ref<HTMLInputElement | null>(null);

/**
 * 导出设置到 JSON 文件
 */
const exportSettings = () => {
  try {
    // 同步最新的 AI 模型数据
    const settings: Settings = {
      aiModels: [...aiModelsStore.models],
      sync: [],
      novels: [],
    };

    // 创建 JSON 字符串
    const jsonString = JSON.stringify(settings, null, 2);

    // 创建 Blob
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `luna-ai-settings-${new Date().toISOString().split('T')[0]}.json`;

    // 触发下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理 URL
    URL.revokeObjectURL(url);

    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: '设置已成功导出到本地文件',
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出设置时发生未知错误',
      life: 5000,
    });
  }
};

/**
 * 导入设置
 */
const importSettings = () => {
  // 触发文件选择
  fileInputRef.value?.click();
};

/**
 * 处理文件选择
 */
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    return;
  }

  // 验证文件类型
  if (!file.type.includes('json') && !file.name.endsWith('.json') && !file.name.endsWith('.txt')) {
    toast.add({
      severity: 'error',
      summary: '文件格式错误',
      detail: '请选择 JSON 或 TXT 格式的文件',
      life: 3000,
    });
    // 清空输入
    target.value = '';
    return;
  }

  // 读取文件
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const settings = JSON.parse(content) as Settings;

      // 验证数据结构
      if (!settings || typeof settings !== 'object') {
        throw new Error('无效的设置数据格式');
      }

      // 验证 aiModels 数组
      if (!Array.isArray(settings.aiModels)) {
        throw new Error('设置数据中缺少有效的 aiModels 数组');
      }

      // 验证每个模型的必需字段
      const validModels: AIModel[] = [];
      for (const model of settings.aiModels) {
        if (
          typeof model === 'object' &&
          model.id &&
          model.name &&
          model.provider &&
          model.model &&
          model.apiKey
        ) {
          validModels.push(model as AIModel);
        }
      }

      if (validModels.length === 0) {
        throw new Error('设置数据中没有有效的 AI 模型');
      }

      // 覆盖当前的 AI 模型数据
      aiModelsStore.clearModels();
      validModels.forEach((model) => {
        aiModelsStore.addModel(model);
      });

      toast.add({
        severity: 'success',
        summary: '导入成功',
        detail: `成功导入 ${validModels.length} 个 AI 模型配置`,
        life: 3000,
      });

      // 清空输入
      target.value = '';
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: error instanceof Error ? error.message : '解析设置文件时发生未知错误',
        life: 5000,
      });
      // 清空输入
      target.value = '';
    }
  };

  reader.onerror = () => {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: '读取文件时发生错误',
      life: 3000,
    });
    // 清空输入
    target.value = '';
  };

  reader.readAsText(file);
};

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    header="设置"
    :modal="true"
    :style="{ width: '500px' }"
    :closable="true"
    class="settings-dialog"
    @update:visible="$emit('update:visible', $event)"
    @hide="handleClose"
  >
    <div class="space-y-4 py-2">
      <!-- 导入资料 -->
      <div class="p-4 rounded-lg border border-white/10 bg-white/5">
        <div class="space-y-3">
          <div>
            <h3 class="text-sm font-medium text-moon/90 mb-1">导入资料</h3>
            <p class="text-xs text-moon/70">从 JSON 或 TXT 文件导入设置，将覆盖当前的 AI 模型配置</p>
          </div>
          <Button
            label="导入资料"
            icon="pi pi-upload"
            class="p-button-primary w-full"
            @click="importSettings"
          />
        </div>
      </div>

      <!-- 导出资料 -->
      <div class="p-4 rounded-lg border border-white/10 bg-white/5">
        <div class="space-y-3">
          <div>
            <h3 class="text-sm font-medium text-moon/90 mb-1">导出资料</h3>
            <p class="text-xs text-moon/70">将当前设置（包括 AI 模型配置）导出为 JSON 文件</p>
          </div>
          <Button
            label="导出资料"
            icon="pi pi-download"
            class="p-button-outlined w-full"
            @click="exportSettings"
          />
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </Dialog>
</template>

