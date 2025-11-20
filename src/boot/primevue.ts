import { defineBoot } from '#q-app/wrappers';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';

import 'primeicons/primeicons.css';

export default defineBoot(({ app }) => {
  app.use(PrimeVue, {
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: '.dark', // 匹配 index.html 中的 dark 类
        cssLayer: false,
      },
    },
    ripple: false,
  });
  app.use(ConfirmationService);
  app.use(ToastService);
});
