<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Password from 'primevue/password';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import { useSettingsStore } from 'src/stores/settings';
import { useFirecrawlKeySettings } from 'src/composables/settings/useFirecrawlKeySettings';
import type { AppSettings } from 'src/models/settings';
import { useI18n } from 'vue-i18n';

const settingsStore = useSettingsStore();
const { t, locale } = useI18n();
const firecrawl = useFirecrawlKeySettings();
const firecrawlUrl = 'https://www.firecrawl.dev/';

const formatPeriodEnd = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString(locale.value) : '';

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
        <h3 class="text-sm font-medium text-moon/90 mb-1">
          {{ t('settingsUi.apiKeys.tavilyTitle') }}
        </h3>
        <p class="text-xs text-moon/70">
          {{ t('settingsUi.apiKeys.tavilyBefore') }}
          <a
            :href="tavilyUrl"
            target="_blank"
            rel="noopener"
            class="text-primary-400 hover:text-primary-300"
          >
            tavily.com
          </a>
          {{ t('settingsUi.apiKeys.tavilyAfter') }}
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
            :label="t('settingsUi.common.save')"
            size="small"
            :disabled="tavilyApiKey === (settingsStore.tavilyApiKey ?? '')"
            @click="saveApiKey(tavilyApiKey)"
          />
        </div>
        <p class="text-xs text-moon/60">
          <span v-if="settingsStore.tavilyApiKey" class="text-green-400">
            <span class="pi pi-check-circle"></span> {{ t('settingsUi.common.configured') }}
          </span>
          <span v-else-if="firecrawl.fallbackEnabled.value" class="text-moon/60">
            <span class="pi pi-info-circle"></span> {{ t('settingsUi.apiKeys.tavilyFallback') }}
          </span>
          <span v-else class="text-amber-400">
            <span class="pi pi-exclamation-triangle"></span>
            {{ t('settingsUi.apiKeys.tavilyDisabled') }}
          </span>
        </p>
      </div>
    </div>

    <!-- Firecrawl -->
    <div class="space-y-3 pt-4 border-t border-moon/20">
      <div>
        <h3 class="text-sm font-medium text-moon/90 mb-1">
          {{ t('settingsUi.apiKeys.firecrawlTitle') }}
        </h3>
        <p class="text-xs text-moon/70">
          {{ t('settingsUi.apiKeys.firecrawlBefore') }}
          <a
            :href="firecrawlUrl"
            target="_blank"
            rel="noopener"
            class="text-primary-400 hover:text-primary-300"
          >
            Firecrawl
          </a>
          {{ t('settingsUi.apiKeys.firecrawlAfter') }}
        </p>
      </div>

      <div class="flex flex-row items-start justify-between gap-3">
        <div class="space-y-1 flex-1 min-w-0">
          <label class="text-xs text-moon/80">{{ t('settingsUi.apiKeys.fallback') }}</label>
          <p class="text-xs text-moon/60">
            {{ t('settingsUi.apiKeys.fallbackHint') }}
          </p>
        </div>
        <ToggleSwitch
          class="shrink-0"
          :model-value="firecrawl.fallbackEnabled.value"
          @update:model-value="firecrawl.setFallbackEnabled"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs text-moon/80">{{ t('settingsUi.apiKeys.optionalKey') }}</label>
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
              :label="t('settingsUi.common.save')"
              size="small"
              :loading="firecrawl.busy.value"
              :disabled="!firecrawl.isDirty.value || firecrawl.busy.value"
              @click="firecrawl.save"
            />
            <Button
              :label="t('settingsUi.apiKeys.checkCredits')"
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
          {{
            t('settingsUi.apiKeys.credits', {
              remaining: firecrawl.credits.value.remainingCredits,
              plan: firecrawl.credits.value.planCredits,
            })
          }}
          <template v-if="firecrawl.credits.value.billingPeriodEnd">
            {{
              t('settingsUi.apiKeys.periodEnd', {
                date: formatPeriodEnd(firecrawl.credits.value.billingPeriodEnd),
              })
            }}
          </template>
        </p>
        <p v-else-if="firecrawl.hasKey.value" class="text-xs text-green-400">
          <span class="pi pi-check-circle"></span> {{ t('settingsUi.apiKeys.firecrawlConfigured') }}
        </p>
        <p v-else class="text-xs text-moon/60">
          <span class="pi pi-info-circle"></span>
          {{ t('settingsUi.apiKeys.keyless') }}
        </p>
      </div>
    </div>

    <!-- 信息说明 -->
    <div class="p-3 bg-moon/5 rounded-lg border border-moon/10">
      <p class="text-xs text-moon/70">
        <span class="pi pi-info-circle mr-1"></span>
        {{ t('settingsUi.apiKeys.storage') }}
      </p>
    </div>
  </div>
</template>
