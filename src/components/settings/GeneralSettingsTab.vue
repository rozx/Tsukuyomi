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
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Select from 'primevue/select';
import { isAppLocale, resolveAppLocale } from 'src/models/locale';
import { languageOptions } from 'src/i18n/translate';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const { t, locale } = useI18n();
const settings = useSettingsStore();
const toast = useToastWithHistory();
const saving = ref(false);
const languages = computed(() => languageOptions(resolveAppLocale(locale.value, [])));

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
