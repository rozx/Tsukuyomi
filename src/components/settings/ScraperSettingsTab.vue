<script setup lang="ts">
import { onMounted } from 'vue';
import InputNumber from 'primevue/inputnumber';
import { useSettingsStore } from 'src/stores/settings';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const settingsStore = useSettingsStore();

// 确保 store 已加载
onMounted(async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
});
</script>

<template>
  <div class="p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">{{ t('settingsUi.scraper.title') }}</h3>
      <p class="text-xs text-moon/70">{{ t('settingsUi.scraper.description') }}</p>
    </div>
    <div class="space-y-2">
      <label class="text-xs text-moon/80">{{ t('settingsUi.scraper.concurrency') }}</label>
      <InputNumber
        :model-value="settingsStore.scraperConcurrencyLimit"
        :min="1"
        :max="10"
        :show-buttons="true"
        class="w-full"
        @update:model-value="(value) => settingsStore.setScraperConcurrencyLimit(Number(value))"
      />
      <p class="text-xs text-moon/60">{{ t('settingsUi.scraper.concurrencyHint') }}</p>
    </div>
  </div>
</template>
