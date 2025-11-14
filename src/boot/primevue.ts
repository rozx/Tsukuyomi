import { defineBoot } from '#q-app/wrappers';
import PrimeVue from 'primevue/config';

// Pick a theme that fits; can switch to unstyled later if desired
import 'primevue/resources/themes/aura-dark-indigo/theme.css';
import 'primeicons/primeicons.css';

export default defineBoot(({ app }) => {
  app.use(PrimeVue, {
    ripple: false,
  });
});
