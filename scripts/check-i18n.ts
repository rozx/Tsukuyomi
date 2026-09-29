import messages from '../src/i18n';
import { validateCatalogs } from '../src/i18n/validate';
import { getPrimeVueLocale } from '../src/i18n/framework';
import type { AppLocale } from '../src/models/locale';

function frameworkMessages(locale: AppLocale) {
  const { firstDayOfWeek: _day, showMonthAfterYear: _order, ...text } = getPrimeVueLocale(locale);
  return text;
}

const errors = [
  ...validateCatalogs(messages),
  ...validateCatalogs({
    'zh-CN': frameworkMessages('zh-CN'),
    'zh-TW': frameworkMessages('zh-TW'),
    'en-US': frameworkMessages('en-US'),
  }),
];
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('三语言资源的 key、参数和编译检查通过。');
}
