import aiUi from './ai-ui';
import embeddingUi from './embedding-ui';
import translationUi from './translation-ui';
import memoryUi from './memory-ui';
import panelUi from './panel-ui';
import readerUi from './reader-ui';
import entityUi from './entity-ui';
import structureUi from './structure-ui';
import coverUi from './cover-ui';
import bookDialog from './book-dialog';
import libraryUi from './library-ui';
import settingsUi from './settings-ui';
import syncUi from './sync-ui';
import activityUi from './activity-ui';
export default {
  ...aiUi,
  ...embeddingUi,
  ...translationUi,
  ...memoryUi,
  ...panelUi,
  ...readerUi,
  ...entityUi,
  ...structureUi,
  ...coverUi,
  ...bookDialog,
  ...libraryUi,
  ...settingsUi,
  ...syncUi,
  ...activityUi,
  failed: '操作失敗',
  success: '操作成功',
};
