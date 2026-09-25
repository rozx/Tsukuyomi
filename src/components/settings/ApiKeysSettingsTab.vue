<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Password from 'primevue/password';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import { useSettingsStore } from 'src/stores/settings';
import { useFirecrawlKeySettings } from 'src/composables/settings/useFirecrawlKeySettings';
import type { AppSettings } from 'src/models/settings';

const settingsStore = useSettingsStore();
const firecrawl = useFirecrawlKeySettings();
const firecrawlUrl = 'https://www.firecrawl.dev/';

const formatPeriodEnd = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString('zh-CN') : '';

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
          <a
            :href="tavilyUrl"
            target="_blank"
            rel="noopener"
            class="text-primary-400 hover:text-primary-300"
          >
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
          <span v-else-if="firecrawl.fallbackEnabled.value" class="text-moon/60">
            <span class="pi pi-info-circle"></span> 未配置 - 助手聊天与导入的网络搜索将改用
            Firecrawl；翻译 / 润色 / 校对任务不提供网络搜索
          </span>
          <span v-else class="text-amber-400">
            <span class="pi pi-exclamation-triangle"></span> 未配置 - 网络搜索功能将被禁用
          </span>
        </p>
      </div>
    </div>

    <!-- Firecrawl -->
    <div class="space-y-3 pt-4 border-t border-moon/20">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">Firecrawl 网页抓取</h3>
        <p class="text-xs text-moon/70">
          当网站无法通过代理或直连访问时，改由
          <a
            :href="firecrawlUrl"
            target="_blank"
            rel="noopener"
            class="text-primary-400 hover:text-primary-300"
          >
            Firecrawl
          </a>
          抓取。未配置 Key 时使用免费的 keyless 模式。
        </p>
      </div>

      <div class="flex flex-row items-start justify-between gap-3">
        <div class="space-y-1 flex-1 min-w-0">
          <label class="text-xs text-moon/80">启用 Firecrawl 回退</label>
          <p class="text-xs text-moon/60">
            作用于网页抓取（导入、更新检查），以及 AI 助手与导入中的网络搜索 / 网页读取。
            启用后，被访问页面的网址与搜索内容会发送给 Firecrawl。
          </p>
        </div>
        <ToggleSwitch
          class="shrink-0"
          :model-value="firecrawl.fallbackEnabled.value"
          @update:model-value="firecrawl.setFallbackEnabled"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs text-moon/80">API Key（可选）</label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Password
            v-model="firecrawl.keyInput.value"
            :feedback="false"
            :toggle-mask="true"
            placeholder="fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            class="flex-1"
            :pt="{ root: { class: 'w-full' }, input: { class: 'w-full' } }"
          />
          <div class="flex gap-2">
            <Button
              label="保存"
              size="small"
              :loading="firecrawl.busy.value"
              :disabled="!firecrawl.isDirty.value || firecrawl.busy.value"
              @click="firecrawl.save"
            />
            <Button
              label="检查额度"
              size="small"
              class="p-button-outlined"
              :loading="firecrawl.busy.value"
              :disabled="!firecrawl.canCheckCredits.value"
              @click="firecrawl.refreshCredits"
            />
          </div>
        </div>
        <p v-if="firecrawl.error.value" class="text-xs text-red-400">
          <span class="pi pi-times-circle"></span> {{ firecrawl.error.value }}
        </p>
        <p v-else-if="firecrawl.credits.value" class="text-xs text-green-400">
          <span class="pi pi-check-circle"></span>
          剩余 {{ firecrawl.credits.value.remainingCredits }} /
          {{ firecrawl.credits.value.planCredits }} 额度
          <template v-if="firecrawl.credits.value.billingPeriodEnd">
            · 账期至 {{ formatPeriodEnd(firecrawl.credits.value.billingPeriodEnd) }}
          </template>
        </p>
        <p v-else-if="firecrawl.hasKey.value" class="text-xs text-green-400">
          <span class="pi pi-check-circle"></span> 已配置，可点击「检查额度」查看剩余额度
        </p>
        <p v-else class="text-xs text-moon/60">
          <span class="pi pi-info-circle"></span>
          未配置：使用 keyless 免费额度（按 IP 每日限额，额度未公开），无法查询剩余额度
        </p>
      </div>
    </div>

    <!-- 信息说明 -->
    <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
      <p class="text-xs text-moon/70">
        <span class="pi pi-info-circle mr-1"></span>
        Tavily 与 Firecrawl 的 API Key 保存在本地浏览器中；开启 Gist 同步时会随应用设置上传到你的
        Gist。Tavily 提供免费计划，每月有足够的搜索次数供个人使用；Firecrawl 未配置 Key 时使用
        keyless 模式，按 IP 每日限额免费使用，大量导入建议配置 Key。
      </p>
    </div>
  </div>
</template>
