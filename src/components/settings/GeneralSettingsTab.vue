<template>
  <section class="space-y-4 p-4" :aria-label="t('settings.general.title')">
    <h2 class="text-lg font-semibold">{{ t('settings.general.title') }}</h2>
    <div class="flex flex-col gap-2 max-w-xl">
      <label for="interface-language">{{ t('settings.general.language') }}</label>
      <Select
        input-id="interface-language"
        :model-value="locale"
        :options="languages"
        option-label="label"
        option-value="value"
        :disabled="saving"
        aria-describedby="interface-language-hint"
        @update:model-value="setLocale"
      />
      <p id="interface-language-hint" class="text-sm opacity-70">
        {{ t('settings.general.languageHint') }}
      </p>
    </div>

    <h3 class="text-base font-semibold pt-2">{{ t('settings.taskQueue.title') }}</h3>
    <div class="flex flex-col gap-2 max-w-xl">
      <label for="task-queue-max-concurrent">{{ t('settings.taskQueue.maxConcurrent') }}</label>
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
      <p id="task-queue-max-concurrent-hint" class="text-sm opacity-70">
        {{ t('settings.taskQueue.maxConcurrentHint') }}
      </p>
    </div>

    <h3 class="text-base font-semibold pt-2">{{ t('settings.deskPet.title') }}</h3>
    <div class="flex items-start justify-between gap-3 max-w-xl">
      <div class="flex flex-col gap-1">
        <label for="desk-pet-enabled">{{ t('settings.deskPet.show') }}</label>
        <p id="desk-pet-enabled-hint" class="text-sm opacity-70">
          {{ t('settings.deskPet.showHint') }}
        </p>
      </div>
      <ToggleSwitch
        input-id="desk-pet-enabled"
        :model-value="settings.deskPetEnabled"
        aria-describedby="desk-pet-enabled-hint"
        @update:model-value="setShowDeskPet"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
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
