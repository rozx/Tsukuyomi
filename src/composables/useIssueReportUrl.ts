import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { APP_DISPLAY_VERSION } from 'src/constants/build-info';
import { isElectron } from 'src/utils/platform';
import { buildIssueReportUrl } from 'src/utils/project-links';

/**
 * 「反馈问题」外链（侧边栏 / 平板导航 / 关于页共用）。
 * 正文预填版本号与运行环境，填写提示随界面语言切换。
 */
export function useIssueReportUrl(): ComputedRef<string> {
  const { t } = useI18n();
  return computed(() =>
    buildIssueReportUrl({
      version: APP_DISPLAY_VERSION,
      platform: isElectron() ? 'Desktop (Electron)' : 'Web',
      userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
      hint: t('libraryUi.reportIssueHint'),
    }),
  );
}
