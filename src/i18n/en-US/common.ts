import bookDialog from './book-dialog';
import libraryUi from './library-ui';
export default {
  ...bookDialog,
  ...libraryUi,
  failed: 'Action failed',
  success: 'Action was successful',
};
