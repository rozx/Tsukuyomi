import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';

/**
 * 实时日志面板的可见性判断
 *
 * 思考过程与输出内容合并为同一个面板后，父级（TaskStream）与两个子区块
 * 都需要同一套「有没有内容 / 是否还在流式输出」的判断，抽到这里避免三处重复。
 */
export function useStreamVisibility(task: MaybeRefOrGetter<AIProcessingTask>) {
  const current = () => toValue(task);

  // 任务处于非终态：即使还没吐出任何 token 也要先把区块占位显示出来
  const isActive = computed(
    () => current().status === 'thinking' || current().status === 'processing',
  );

  const hasThinking = computed(() => (current().thinkingMessage?.trim().length ?? 0) > 0);
  const hasOutput = computed(() => (current().outputContent?.trim().length ?? 0) > 0);

  const showThinking = computed(() => hasThinking.value || isActive.value);
  const showPanel = computed(() => showThinking.value || hasOutput.value);

  const isThinkingActive = computed(() => isActive.value && hasThinking.value);
  const isOutputActive = computed(() => isActive.value && hasOutput.value);

  return {
    isActive,
    hasThinking,
    hasOutput,
    showThinking,
    showPanel,
    isThinkingActive,
    isOutputActive,
  };
}
