import { computed, ref } from 'vue';
import type { AppLocale } from 'src/models/locale';
import { useSettingsStore } from 'src/stores/settings';
import { translateText } from 'src/i18n/translate';

/** 编辑开始时捕获语言，目标改变后保留草稿并要求重新打开。 */
export function useLanguageEditGuard(currentLanguage: () => AppLocale) {
  const formLanguage = ref(currentLanguage());
  const settings = useSettingsStore();
  return {
    languageChanged: computed(() => formLanguage.value !== currentLanguage()),
    languageChangedMessage: computed(() => translateText(settings.uiLocale, 'books.reopenEditor')),
    captureLanguage: () => {
      formLanguage.value = currentLanguage();
    },
  };
}
