import { APP_VERSION } from './version';
import { formatAppVersion } from 'src/utils/app-version';

/**
 * 界面显示的版本号，例如 `0.18.1.1532 (0fa51f9)`；
 * 短 SHA 与提交数由 quasar.config.ts 在构建时注入
 */
export const APP_DISPLAY_VERSION = formatAppVersion(
  APP_VERSION,
  process.env.APP_BUILD_COMMIT,
  process.env.APP_BUILD_COMMIT_COUNT,
);
