import bookDialog from './book-dialog';
import libraryUi from './library-ui';
export default {
  ...bookDialog,
  ...libraryUi,
  failed: '操作失敗',
  success: '操作成功',
};
