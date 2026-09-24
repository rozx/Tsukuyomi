import { onBeforeUnmount, ref, watch } from 'vue';
import type { WatchSource } from 'vue';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIConfigResult } from 'src/services/ai/types/ai-service';
import { ConfigService } from 'src/services/ai/tasks/config-service';
import type { ModelAvailabilityResult } from 'src/services/ai/tasks/config-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { getErrorMessage } from 'src/utils/error-message';

/** 绑定当前表单快照，关闭或修改表单后取消测试并丢弃过期结果。 */
export function useModelConfiguration(options: {
  source: WatchSource<unknown>;
  visible: () => boolean;
  model: () => AIModel;
  applyCatalog: (result: AIConfigResult) => void;
}) {
  const toast = useToastWithHistory();
  const isFetchingConfig = ref(false);
  const isTesting = ref(false);
  const availabilityResult = ref<ModelAvailabilityResult | null>(null);
  let revision = 0;
  let controller: AbortController | undefined;
  const cancel = () => {
    revision++;
    controller?.abort();
    controller = undefined;
    isFetchingConfig.value = false;
    isTesting.value = false;
    availabilityResult.value = null;
  };
  watch(options.source, cancel, { deep: true, flush: 'sync' });
  onBeforeUnmount(cancel);
  const current = (request: number) => request === revision && options.visible();

  const fetchModelInfo = async () => {
    cancel();
    const request = revision;
    isFetchingConfig.value = true;
    try {
      const result = await ConfigService.getConfig(options.model());
      if (!current(request)) return;
      if (result.success) options.applyCatalog(result);
      toast.add({
        severity: result.success ? 'success' : 'info',
        summary: result.success ? '已获取模型资料' : '目录暂无记录',
        detail: result.message,
        life: 4000,
      });
    } catch (error) {
      if (current(request))
        toast.add({
          severity: 'error',
          summary: '获取模型资料失败',
          detail: getErrorMessage(error),
          life: 5000,
        });
    } finally {
      if (current(request)) isFetchingConfig.value = false;
    }
  };

  const testAvailability = async () => {
    cancel();
    const request = revision;
    const activeController = new AbortController();
    controller = activeController;
    isTesting.value = true;
    try {
      const result = await ConfigService.testAvailability(options.model(), {
        signal: activeController.signal,
      });
      if (!current(request) || activeController.signal.aborted) return;
      availabilityResult.value = result;
      toast.add({
        severity: result.success ? 'success' : 'error',
        summary: result.success ? '模型可用' : '模型测试失败',
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
