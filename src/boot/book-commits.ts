import { defineBoot } from '#q-app/wrappers';
import { startBookCommitNotifications } from 'src/composables/useBookCommitNotifications';

export default defineBoot(() => {
  const observer = startBookCommitNotifications();
  if (import.meta.hot) import.meta.hot.dispose(() => observer.dispose());
});
