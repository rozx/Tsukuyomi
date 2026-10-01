import { watch } from 'vue';
import type { App } from 'vue';
import type { Pinia } from 'pinia';
import { Lang } from 'quasar';
import enUS from 'quasar/lang/en-US';
import zhCN from 'quasar/lang/zh-CN';
import zhTW from 'quasar/lang/zh-TW';
import { resolveAppLocale } from 'src/models/locale';
import { useSettingsStore } from 'src/stores/settings';
import { isDbBlocked } from 'src/utils/indexed-db';
import { createAppI18n } from './vue';
import { getPrimeVueLocale } from './framework';

const quasarLocales = { 'zh-CN': zhCN, 'zh-TW': zhTW, 'en-US': enUS };

/** 轮询直到数据库报告升级被阻塞；返回的 stop 用于提前结束轮询。 */
function untilBlocked(isBlocked: () => boolean, pollMs: number) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const blocked = new Promise<void>((resolve) => {
    timer = setInterval(() => {
      if (isBlocked()) resolve();
    }, pollMs);
  });
  return { blocked, stop: () => clearInterval(timer) };
}

export async function initializeI18n(
  app: App,
  pinia: Pinia | undefined,
  preferred: readonly string[],
  options: { isDatabaseBlocked?: () => boolean; pollMs?: number } = {},
) {
  const settings = useSettingsStore(pinia);
  const loading = settings.loadSettings().catch((error: unknown) => {
    console.error('无法读取语言设置，使用系统语言。', error);
    settings.isLoaded = true;
  });
  // 正常情况下等设置读完，首屏直接用已存语言；但旧标签页阻塞数据库升级时读取会一直挂起，
  // 此时先按系统语言挂载应用（才能显示「请关闭旧页面」提示），读到设置后由下方 watch 切换语言
  const wait = untilBlocked(options.isDatabaseBlocked ?? isDbBlocked, options.pollMs ?? 50);
  try {
    await Promise.race([loading, wait.blocked]);
  } finally {
    wait.stop();
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
