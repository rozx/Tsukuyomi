<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Password from 'primevue/password';
import Button from 'primevue/button';
import { useSettingsStore } from 'src/stores/settings';
import type { AppSettings } from 'src/models/settings';

const settingsStore = useSettingsStore();

// 本地表单状态
const tavilyApiKey = ref<string>('');

// 确保表单状态与 store 同步
const syncFormState = () => {
  tavilyApiKey.value = settingsStore.tavilyApiKey ?? '';
};

// 确保 store 已加载
onMounted(async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
  syncFormState();
});

// 保存 API Key
const saveApiKey = async (key: string) => {
  if (key) {
    await settingsStore.updateSettings({ tavilyApiKey: key });
  } else {
    // 删除 API Key（使用类型断言以绕过 exactOptionalPropertyTypes 检查）
    await settingsStore.updateSettings({ tavilyApiKey: undefined as any });
  }
};

// 获取 Tavily API Key 的链接
const tavilyUrl = 'https://tavily.com/';
</script>

<template>
  <div class="p-4 space-y-4">
    <!-- Tavily API Key -->
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">Tavily 搜索 API</h3>
        <p class="text-xs text-moon/70">
          用于 AI 助手的网络搜索功能。在
          <a :href="tavilyUrl" target="_blank" rel="noopener" class="text-primary-400 hover:text-primary-300">
            tavily.com
          </a>
          注册并获取免费的 API Key。
        </p>
      </div>

      <div class="space-y-2">
        <label class="text-xs text-moon/80">API Key</label>
        <div class="flex gap-2">
          <Password
            v-model="tavilyApiKey"
            :feedback="false"
            :toggle-mask="true"
            placeholder="tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            class="flex-1"
            :pt="{ root: { class: 'w-full' }, input: { class: 'w-full' } }"
          />
          <Button
            label="保存"
            size="small"
            :disabled="tavilyApiKey === (settingsStore.tavilyApiKey ?? '')"
            @click="saveApiKey(tavilyApiKey)"
          />
        </div>
        <p class="text-xs text-moon/60">
          <span v-if="settingsStore.tavilyApiKey" class="text-green-400">
            <span class="pi pi-check-circle"></span> 已配置
          </span>
          <span v-else class="text-amber-400">
            <span class="pi pi-exclamation-triangle"></span> 未配置 - 网络搜索功能将被禁用
          </span>
        </p>
      </div>
    </div>

    <!-- 信息说明 -->
    <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
      <p class="text-xs text-moon/70">
        <span class="pi pi-info-circle mr-1"></span>
        API Key 将安全地存储在本地浏览器中。Tavily 提供免费计划，每月有足够的搜索次数供个人使用。
      </p>
    </div>
  </div>
</template>
