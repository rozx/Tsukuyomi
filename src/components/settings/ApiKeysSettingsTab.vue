<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import Password from 'primevue/password';
import Button from 'primevue/button';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsField from './form/SettingsField.vue';
import SettingsToggleRow from './form/SettingsToggleRow.vue';
import SettingsNote from './form/SettingsNote.vue';
import SettingsStatus from './form/SettingsStatus.vue';
import { useSettingsStore } from 'src/stores/settings';
import { useFirecrawlKeySettings } from 'src/composables/settings/useFirecrawlKeySettings';
import { useI18n } from 'vue-i18n';

const settingsStore = useSettingsStore();
const { t, locale } = useI18n();
const firecrawl = useFirecrawlKeySettings();
const firecrawlUrl = 'https://www.firecrawl.dev/';

const formatPeriodEnd = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString(locale.value) : '';

// 本地表单状态
const tavilyApiKey = ref(settingsStore.tavilyApiKey ?? '');

// 确保表单状态与 store 同步
watch(
  () => settingsStore.tavilyApiKey,
  (key, previousKey) => {
    // 后台加载或同步只回填未编辑的表单，避免覆盖尚未保存的输入。
    if (tavilyApiKey.value === (previousKey ?? '')) tavilyApiKey.value = key ?? '';
  },
);

// 确保 store 已加载
onMounted(async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
});

// 保存 API Key
const saveApiKey = async (key: string) => {
  await settingsStore.updateSettings({ tavilyApiKey: key.trim() || undefined });
  tavilyApiKey.value = settingsStore.tavilyApiKey ?? '';
};

// 获取 Tavily API Key 的链接
const tavilyUrl = 'https://tavily.com/';
</script>

<template>
  <SettingsPanel>
    <!-- Tavily API Key -->
    <SettingsSection :title="t('settingsUi.apiKeys.tavilyTitle')">
      <template #description>
        {{ t('settingsUi.apiKeys.tavilyBefore') }}
        <a :href="tavilyUrl" target="_blank" rel="noopener">tavily.com</a>
        {{ t('settingsUi.apiKeys.tavilyAfter') }}
      </template>

      <SettingsField label="API Key" input-id="tavily-api-key">
        <div class="api-key-row">
          <Password
            v-model="tavilyApiKey"
            input-id="tavily-api-key"
            :feedback="false"
            :toggle-mask="true"
            placeholder="tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            fluid
            class="api-key-input"
          />
          <div class="api-key-buttons">
            <Button
              :label="t('settingsUi.common.save')"
              :disabled="tavilyApiKey === (settingsStore.tavilyApiKey ?? '')"
              @click="saveApiKey(tavilyApiKey)"
            />
          </div>
        </div>
        <template #hint>
          <SettingsStatus v-if="settingsStore.tavilyApiKey" tone="success">
            {{ t('settingsUi.common.configured') }}
          </SettingsStatus>
          <SettingsStatus v-else-if="firecrawl.fallbackEnabled.value" tone="muted">
            {{ t('settingsUi.apiKeys.tavilyFallback') }}
          </SettingsStatus>
          <SettingsStatus v-else tone="warn">
            {{ t('settingsUi.apiKeys.tavilyDisabled') }}
          </SettingsStatus>
        </template>
      </SettingsField>
    </SettingsSection>

    <!-- Firecrawl -->
    <SettingsSection :title="t('settingsUi.apiKeys.firecrawlTitle')">
      <template #description>
        {{ t('settingsUi.apiKeys.firecrawlBefore') }}
        <a :href="firecrawlUrl" target="_blank" rel="noopener">Firecrawl</a>
        {{ t('settingsUi.apiKeys.firecrawlAfter') }}
      </template>

      <SettingsToggleRow
        :label="t('settingsUi.apiKeys.fallback')"
        :hint="t('settingsUi.apiKeys.fallbackHint')"
        :model-value="firecrawl.fallbackEnabled.value"
        @update:model-value="firecrawl.setFallbackEnabled"
      />

      <SettingsField :label="t('settingsUi.apiKeys.optionalKey')" input-id="firecrawl-api-key">
        <div class="api-key-row">
          <Password
            v-model="firecrawl.keyInput.value"
            input-id="firecrawl-api-key"
            :feedback="false"
            :toggle-mask="true"
            placeholder="fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            fluid
            class="api-key-input"
          />
          <div class="api-key-buttons">
            <Button
              :label="t('settingsUi.common.save')"
              :loading="firecrawl.busy.value"
              :disabled="!firecrawl.isDirty.value || firecrawl.busy.value"
              @click="firecrawl.save"
            />
            <Button
              :label="t('settingsUi.apiKeys.checkCredits')"
              outlined
              :loading="firecrawl.busy.value"
              :disabled="!firecrawl.canCheckCredits.value"
              @click="firecrawl.refreshCredits"
            />
          </div>
        </div>
        <template #hint>
          <SettingsStatus v-if="firecrawl.error.value" tone="error">
            {{ firecrawl.error.value }}
          </SettingsStatus>
          <SettingsStatus v-else-if="firecrawl.credits.value" tone="success">
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
          </SettingsStatus>
          <SettingsStatus v-else-if="firecrawl.hasKey.value" tone="success">
            {{ t('settingsUi.apiKeys.firecrawlConfigured') }}
          </SettingsStatus>
          <SettingsStatus v-else tone="muted">
            {{ t('settingsUi.apiKeys.keyless') }}
          </SettingsStatus>
        </template>
      </SettingsField>
    </SettingsSection>

    <!-- 信息说明 -->
    <SettingsNote>{{ t('settingsUi.apiKeys.storage') }}</SettingsNote>
  </SettingsPanel>
</template>

<style scoped>
.api-key-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.api-key-input {
  flex: 1 1 16rem;
  min-width: 0;
}

.api-key-buttons {
  display: flex;
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .api-key-buttons {
    flex: 1 1 100%;
  }

  .api-key-buttons > * {
    flex: 1 1 auto;
  }
}
</style>
