import { defineBoot } from '#q-app/wrappers';
import PrimeVue from 'primevue/config';
import TsukuyomiPreset from 'src/theme/tsukuyomi-preset';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { getPrimeVueLocale } from 'src/i18n/framework';
import { resolveAppLocale } from 'src/models/locale';
import { useSettingsStore } from 'src/stores/settings';

import 'primeicons/primeicons.css';

export default defineBoot(({ app, store }) => {
  app.use(PrimeVue, {
    locale: getPrimeVueLocale(
      resolveAppLocale(useSettingsStore(store).settings.uiLocale, navigator.languages),
    ),
    theme: {
      preset: TsukuyomiPreset,
      options: {
        darkModeSelector: '.dark',
        cssLayer: false,
      },
    },
    ripple: false,
  });
  app.use(ConfirmationService);
  app.use(ToastService);
  app.directive('tooltip', Tooltip);
});
