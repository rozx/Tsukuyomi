import { ref, nextTick, type Ref, onUnmounted } from 'vue';
import type { ChatMessage } from 'src/stores/chat-sessions';
import { throttle } from 'src/utils/throttle';

/**
 * 思考过程显示逻辑
 */
export function useThinkingDisplay(messages: Ref<ChatMessage[]>, scrollToBottom: () => void) {
  // 思考过程展开状态（messageId -> expanded）
  const thinkingExpanded = ref<Map<string, boolean>>(new Map());

  // 思考过程内容容器 ref（messageId -> element）
  const thinkingContentRefs = ref<Map<string, HTMLElement>>(new Map());

  // 思考过程展示缓存：避免每个 token 都触发整段文本更新
  const displayedThinkingProcess = ref<Record<string, string>>({});
  const displayedThinkingPreview = ref<Record<string, string>>({});

  // 思考过程活动状态（messageId -> isActive），用于显示加载指示器
  const thinkingActive = ref<Map<string, boolean>>(new Map());

  // 思考过程活动状态超时器（messageId -> timeoutId）
  const thinkingActiveTimeouts = ref<Map<string, number>>(new Map());

  // 为每条消息单独节流滚动（使用工具函数）
  const thinkingScrollHandlers = ref<Map<string, () => void>>(new Map());
  const thinkingScrollCleanups = ref<Map<string, () => void>>(new Map());

  const buildThinkingPreview = (thinkingProcess: string): string => {
    if (!thinkingProcess) return '';
    const lines = thinkingProcess.split('\n');
    const lastLines = lines.slice(-3);
    return lastLines.join('\n');
  };

  const throttledUpdate = throttle(
    (messageId: string, thinkingProcess: string) => {
      displayedThinkingProcess.value[messageId] = thinkingProcess;
      displayedThinkingPreview.value[messageId] = buildThinkingPreview(thinkingProcess);
    },
    120,
    { trailing: false },
  );

  const updateDisplayedThinkingProcess = (messageId: string, thinkingProcess: string) => {
    throttledUpdate.fn(messageId, thinkingProcess);
  };

  const setDisplayedThinkingImmediatelyIfEmpty = (messageId: string, thinkingProcess: string) => {
    if (displayedThinkingProcess.value[messageId] === undefined) {
      displayedThinkingProcess.value[messageId] = thinkingProcess;
      displayedThinkingPreview.value[messageId] = buildThinkingPreview(thinkingProcess);
    }
  };

  // 设置思考过程为活动状态
  const setThinkingActive = (messageId: string, isActive: boolean) => {
    if (isActive) {
      thinkingActive.value.set(messageId, true);
      // 清除之前的超时器（如果有）
      const existingTimeout = thinkingActiveTimeouts.value.get(messageId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        thinkingActiveTimeouts.value.delete(messageId);
      }
    } else {
      thinkingActive.value.delete(messageId);
      // 清除超时器
      const existingTimeout = thinkingActiveTimeouts.value.get(messageId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        thinkingActiveTimeouts.value.delete(messageId);
      }
    }
  };

  // 标记思考过程为活动状态，并在2秒后自动清除
  const markThinkingActive = (messageId: string) => {
    thinkingActive.value.set(messageId, true);
    // 清除之前的超时器
    const existingTimeout = thinkingActiveTimeouts.value.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    // 设置新的超时器
    const timeoutId = window.setTimeout(() => {
      thinkingActive.value.delete(messageId);
      thinkingActiveTimeouts.value.delete(messageId);
    }, 2000);
    thinkingActiveTimeouts.value.set(messageId, timeoutId);
  };

  // 设置思考过程内容容器 ref
  const setThinkingContentRef = (messageId: string, el: HTMLElement | null) => {
    if (el) {
      thinkingContentRefs.value.set(messageId, el);
    } else {
      thinkingContentRefs.value.delete(messageId);
    }
  };

  // 滚动思考过程内容到底部
  const scrollThinkingToBottom = (messageId: string) => {
    const container = thinkingContentRefs.value.get(messageId);
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  };

  const requestScrollThinkingToBottom = (messageId: string) => {
    let handler = thinkingScrollHandlers.value.get(messageId);
    if (!handler) {
      const throttled = throttle(
        () => {
          void nextTick(() => {
            scrollThinkingToBottom(messageId);
          });
        },
        100,
        { trailing: false },
      );
      handler = throttled.fn;
      thinkingScrollHandlers.value.set(messageId, handler);
      thinkingScrollCleanups.value.set(messageId, throttled.cleanup);
    }
    handler();
  };

  // 切换思考过程折叠状态
  const toggleThinking = (messageId: string) => {
    const current = thinkingExpanded.value.get(messageId) || false;
    const willExpand = !current;
    thinkingExpanded.value.set(messageId, willExpand);

    // 展开时，先把最新 thinking 文本同步到展示缓存
    const msg = messages.value.find((m) => m.id === messageId);
    if (msg?.thinkingProcess) {
      setDisplayedThinkingImmediatelyIfEmpty(messageId, msg.thinkingProcess);
      updateDisplayedThinkingProcess(messageId, msg.thinkingProcess);
    }

    // 如果展开，等待 DOM 更新后滚动到底部
    if (willExpand) {
      void nextTick(() => {
        requestScrollThinkingToBottom(messageId);
        // 同时滚动消息容器到底部
        scrollToBottom();
      });
    }
  };

  // 组件卸载时清理
  onUnmounted(() => {
    clearThinkingState();
  });

  // 清理所有状态
  const clearThinkingState = () => {
    for (const timeoutId of thinkingActiveTimeouts.value.values()) {
      clearTimeout(timeoutId);
    }
    thinkingActiveTimeouts.value.clear();
    thinkingActive.value.clear();
    // 清理节流器
    for (const cleanup of thinkingScrollCleanups.value.values()) {
      cleanup();
    }
    thinkingScrollHandlers.value.clear();
    thinkingScrollCleanups.value.clear();
    thinkingExpanded.value.clear();
    thinkingContentRefs.value.clear();
    displayedThinkingProcess.value = {};
    displayedThinkingPreview.value = {};
  };

  // 清理特定消息的状态
  const clearThinkingStateForMessage = (messageId: string) => {
    // Clear timeout
    const timeoutId = thinkingActiveTimeouts.value.get(messageId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      thinkingActiveTimeouts.value.delete(messageId);
    }
    // Clear handlers and state
    const cleanup = thinkingScrollCleanups.value.get(messageId);
    if (cleanup) {
      cleanup();
      thinkingScrollCleanups.value.delete(messageId);
    }
    thinkingScrollHandlers.value.delete(messageId);
    thinkingContentRefs.value.delete(messageId);
    thinkingExpanded.value.delete(messageId);
    thinkingActive.value.delete(messageId);
    // Clear display cache
    delete displayedThinkingProcess.value[messageId];
    delete displayedThinkingPreview.value[messageId];
  };

  // 初始化思考过程缓存（用于会话加载时）
  const initializeThinkingState = () => {
    const nextDisplayed: Record<string, string> = {};
    const nextPreview: Record<string, string> = {};

    for (const msg of messages.value) {
      const thinking = msg.thinkingProcess;
      if (thinking && thinking.trim()) {
        nextDisplayed[msg.id] = thinking;
        nextPreview[msg.id] = buildThinkingPreview(thinking);
      }
    }

    displayedThinkingProcess.value = nextDisplayed;
    displayedThinkingPreview.value = nextPreview;
  };

  return {
    thinkingExpanded,
    thinkingContentRefs,
    displayedThinkingProcess,
    displayedThinkingPreview,
    thinkingActive,
    setThinkingActive,
    markThinkingActive,
    setThinkingContentRef,
    requestScrollThinkingToBottom,
    toggleThinking,
    updateDisplayedThinkingProcess,
    setDisplayedThinkingImmediatelyIfEmpty,
    buildThinkingPreview,
    clearThinkingState,
    clearThinkingStateForMessage,
    initializeThinkingState,
  };
}
