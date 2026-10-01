import { onBeforeUnmount, ref, watch, computed } from 'vue';
import type { WatchSource } from 'vue';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIConfigResult } from 'src/services/ai/types/ai-service';
import { ConfigService } from 'src/services/ai/tasks/config-service';
import type { ModelAvailabilityResult } from 'src/services/ai/tasks/config-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';
import { localizedErrorMessage } from 'src/utils/localized-error';

/** 绑定当前表单快照，关闭或修改表单后取消测试并丢弃过期结果。 */
export function useModelConfiguration(options: {
  source: WatchSource<unknown>;
  visible: () => boolean;
  model: () => AIModel;
  applyCatalog: (result: AIConfigResult) => void;
}) {
  const toast = useToastWithHistory();
  const { locale } = useI18n();
  const isFetchingConfig = ref(false);
  const isTesting = ref(false);
  const rawAvailabilityResult = ref<ModelAvailabilityResult | null>(null);
  const availabilityResult = computed(() => {
    const result = rawAvailabilityResult.value;
    return result?.messageKey
      ? {
          ...result,
          message: translateText(
            resolveAppLocale(locale.value),
            result.messageKey,
            result.messageValues,
          ),
        }
      : result;
  });
  let revision = 0;
  let controller: AbortController | undefined;
  const cancel = () => {
    revision++;
    controller?.abort();
    controller = undefined;
    isFetchingConfig.value = false;
    isTesting.value = false;
    rawAvailabilityResult.value = null;
  };
  watch(options.source, cancel, { deep: true, flush: 'sync' });
  onBeforeUnmount(cancel);
  const current = (request: number) => request === revision && options.visible();

  const fetchModelInfo = async () => {
    cancel();
    const request = revision;
    const uiLocale = resolveAppLocale(locale.value);
    isFetchingConfig.value = true;
    try {
      const result = await ConfigService.getConfig(options.model(), uiLocale);
      if (!current(request)) return;
      if (result.success) options.applyCatalog(result);
      toast.add({
        severity: result.success ? 'success' : 'info',
        summary: translateText(
          uiLocale,
          result.success ? 'aiUi.infoFetched' : 'aiUi.noCatalogRecord',
        ),
        detail: result.message,
        life: 4000,
      });
    } catch (error) {
      if (current(request))
        toast.add({
          severity: 'error',
          summary: translateText(uiLocale, 'aiUi.infoFetchFailed'),
          detail: localizedErrorMessage(error, uiLocale, 'aiUi.infoFetchFailed'),
          life: 5000,
        });
    } finally {
      if (current(request)) isFetchingConfig.value = false;
    }
  };

  const testAvailability = async () => {
    cancel();
    const request = revision;
    const uiLocale = resolveAppLocale(locale.value);
    const activeController = new AbortController();
    controller = activeController;
    isTesting.value = true;
    try {
      const result = await ConfigService.testAvailability(options.model(), {
        signal: activeController.signal,
        uiLocale,
      });
      if (!current(request) || activeController.signal.aborted) return;
      rawAvailabilityResult.value = result;
      toast.add({
        severity: result.success ? 'success' : 'error',
        summary: translateText(uiLocale, result.success ? 'aiUi.available' : 'aiUi.testFailed'),
        detail: result.message,
        life: 4000,
      });
    } finally {
      if (current(request)) {
        isTesting.value = false;
        controller = undefined;
      }
    }
  };
  return { isFetchingConfig, isTesting, availabilityResult, fetchModelInfo, testAvailability };
}
