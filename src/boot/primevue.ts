import { defineBoot } from '#q-app/wrappers';
import PrimeVue from 'primevue/config';
import TsukuyomiPreset from 'src/theme/tsukuyomi-preset';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';

import 'primeicons/primeicons.css';

export default defineBoot(({ app }: any) => {
  app.use(PrimeVue, {
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
