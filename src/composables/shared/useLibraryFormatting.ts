import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { formatRelativeBookDate, formatWordCount } from 'src/utils/format';

/** 首页与书库共用格式；调用时读取当前界面语言。 */
export function useLibraryFormatting() {
  const { locale } = useI18n();
  return {
    formatDate: (date: Date | string) =>
      formatRelativeBookDate(date, resolveAppLocale(locale.value)),
    formatWordCount: (count: number | null) =>
      formatWordCount(count, resolveAppLocale(locale.value)),
  };
}
