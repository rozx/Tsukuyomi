<template>
  <SettingsPanel>
    <SettingsSection :title="t('settings.general.title')">
      <SettingsField
        :label="t('settings.general.language')"
        input-id="interface-language"
        :hint="t('settings.general.languageHint')"
        hint-id="interface-language-hint"
      >
        <Select
          input-id="interface-language"
          :model-value="locale"
          :options="languages"
          option-label="label"
          option-value="value"
          :disabled="saving"
          class="w-full"
          aria-describedby="interface-language-hint"
          @update:model-value="setLocale"
        />
      </SettingsField>
    </SettingsSection>

    <SettingsSection :title="t('settings.taskQueue.title')">
      <SettingsField
        :label="t('settings.taskQueue.maxConcurrent')"
        input-id="task-queue-max-concurrent"
        :hint="t('settings.taskQueue.maxConcurrentHint')"
        hint-id="task-queue-max-concurrent-hint"
      >
        <InputNumber
          input-id="task-queue-max-concurrent"
          :model-value="settings.taskQueueMaxConcurrent"
          :min="TASK_QUEUE_MAX_CONCURRENT_MIN"
          :max="TASK_QUEUE_MAX_CONCURRENT_MAX"
          :step="1"
          show-buttons
          button-layout="horizontal"
          :allow-empty="false"
          class="w-40"
          aria-describedby="task-queue-max-concurrent-hint"
          @update:model-value="setMaxConcurrent"
        />
      </SettingsField>
    </SettingsSection>

    <SettingsSection :title="t('settings.deskPet.title')">
      <SettingsToggleRow
        input-id="desk-pet-enabled"
        :label="t('settings.deskPet.show')"
        :hint="t('settings.deskPet.showHint')"
        :model-value="settings.deskPetEnabled"
        @update:model-value="setShowDeskPet"
      />
    </SettingsSection>
  </SettingsPanel>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import SettingsPanel from './form/SettingsPanel.vue';
import SettingsSection from './form/SettingsSection.vue';
import SettingsField from './form/SettingsField.vue';
import SettingsToggleRow from './form/SettingsToggleRow.vue';
import { isAppLocale, resolveAppLocale } from 'src/models/locale';
import { languageOptions } from 'src/i18n/translate';
import {
  TASK_QUEUE_MAX_CONCURRENT_MAX,
  TASK_QUEUE_MAX_CONCURRENT_MIN,
} from 'src/models/task-queue';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const { t, locale } = useI18n();
const settings = useSettingsStore();
const toast = useToastWithHistory();
const saving = ref(false);
const languages = computed(() => languageOptions(resolveAppLocale(locale.value, [])));

// 保存期间不能禁用步进器：禁用会让按钮收不到 mouseup，PrimeVue 的长按连增计时器不会停止
async function setMaxConcurrent(value: number | null) {
  if (typeof value !== 'number' || value === settings.taskQueueMaxConcurrent) return;
  try {
    await settings.setTaskQueueMaxConcurrent(value);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('settings.taskQueue.saveFailed'),
      detail: String(error),
      life: 5000,
    });
  }
}

async function setShowDeskPet(value: boolean) {
  if (value === settings.deskPetEnabled) return;
  try {
    await settings.setShowDeskPet(value);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('settings.deskPet.saveFailed'),
      detail: String(error),
      life: 5000,
    });
  }
}

async function setLocale(value: unknown) {
  if (!isAppLocale(value) || saving.value) return;
  saving.value = true;
  try {
    await settings.setUiLocale(value);
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('settings.general.saveFailed'),
      detail: String(error),
      life: 5000,
    });
  } finally {
    saving.value = false;
  }
}
</script>
