<script setup lang="ts">
import { onMounted } from 'vue';
import InputNumber from 'primevue/inputnumber';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsField from './form/SettingsField.vue';
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
  <SettingsPanel>
    <SettingsSection
      :title="t('settingsUi.scraper.title')"
      :description="t('settingsUi.scraper.description')"
    >
      <SettingsField
        :label="t('settingsUi.scraper.concurrency')"
        input-id="scraper-concurrency"
        :hint="t('settingsUi.scraper.concurrencyHint')"
      >
        <InputNumber
          input-id="scraper-concurrency"
          :model-value="settingsStore.scraperConcurrencyLimit"
          :min="1"
          :max="10"
          show-buttons
          button-layout="horizontal"
          :allow-empty="false"
          class="w-40"
          @update:model-value="(value) => settingsStore.setScraperConcurrencyLimit(Number(value))"
        />
      </SettingsField>
    </SettingsSection>
  </SettingsPanel>
</template>
