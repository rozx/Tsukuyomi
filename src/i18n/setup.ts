import { watch } from 'vue';
import type { App } from 'vue';
import type { Pinia } from 'pinia';
import { Lang } from 'quasar';
import enUS from 'quasar/lang/en-US';
import zhCN from 'quasar/lang/zh-CN';
import zhTW from 'quasar/lang/zh-TW';
import { resolveAppLocale } from 'src/models/locale';
import { useSettingsStore } from 'src/stores/settings';
import { createAppI18n } from './vue';
import { getPrimeVueLocale } from './framework';

const quasarLocales = { 'zh-CN': zhCN, 'zh-TW': zhTW, 'en-US': enUS };

export async function initializeI18n(
  app: App,
  pinia: Pinia | undefined,
  preferred: readonly string[],
) {
  const settings = useSettingsStore(pinia);
  try {
    await settings.loadSettings();
  } catch (error) {
    console.error('无法读取语言设置，使用系统语言。', error);
    settings.isLoaded = true;
  }
  const i18n = createAppI18n(resolveAppLocale(settings.settings.uiLocale, preferred));
  app.use(i18n);
  const stop = watch(
    () => settings.settings.uiLocale,
    (saved) => {
      const locale = resolveAppLocale(saved, preferred);
      i18n.global.locale.value = locale;
      if (typeof document !== 'undefined') document.documentElement.lang = locale;
      Lang.set(quasarLocales[locale]);
      const primeVue = app.config.globalProperties.$primevue;
      if (primeVue) primeVue.config.locale = getPrimeVueLocale(locale);
      if (typeof window !== 'undefined') {
        void window.electronAPI?.setUiLocale?.(locale).catch((error: unknown) => {
          console.error('无法更新桌面语言', error);
        });
      }
    },
    { immediate: true, flush: 'sync' },
  );
  app.onUnmount(stop);
  return i18n;
}
