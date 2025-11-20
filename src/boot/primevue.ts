import { defineBoot } from '#q-app/wrappers';
import PrimeVue from 'primevue/config';
import LunaPreset from 'src/theme/luna-preset';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';

import 'primeicons/primeicons.css';

export default defineBoot(({ app }) => {
  app.use(PrimeVue, {
    theme: {
      preset: LunaPreset,
      options: {
        darkModeSelector: '.dark',
        cssLayer: false,
      },
    },
    ripple: false,
  });
  app.use(ConfirmationService);
  app.use(ToastService);
});
