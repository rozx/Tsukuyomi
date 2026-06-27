/**
 * 三个 AI 助手聊天面板变体（`AppChatPanelDesktop.vue` / `TabletChatPanel.vue` /
 * `MobileChatSheet.vue`）共享的输入栏 / 发送按钮派生状态。
 *
 * 三处原本各自重复一整块 computed：在线状态副标题、placeholder、输入禁用、
 * 发送按钮 class / 禁用 / aria-label / 图标，以及点击切换发送/停止。差异只有两处：
 *   1. 发送按钮的 CSS class 前缀（`cp-send` / `tcp-send` / `mc-send`）；
 *   2. 桌面 placeholder 末尾带 `(Shift+Enter 换行)` 提示。
 * 故把前缀与 placeholder 文案作为入参，逻辑收敛到这里，渲染结果逐字不变。
 */
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { AIModel } from 'src/services/ai/types/ai-model';

/** 渲染 `ChatSendButton.vue` 所需的全部 props。供 composable 与组件共用，字段只声明一处。 */
export interface ChatSendButtonBindings {
  /** 变体专属基类，如 'cp-send' / 'tcp-send' / 'mc-send'。 */
  baseClass: string;
  /** 状态类对象（`--stop` / `--idle`）。 */
  sendClass: Record<string, boolean>;
  disabled: boolean;
  ariaLabel: string;
  /** 图标类，如 'pi-send' / 'pi-stop-circle'。 */
  icon: string;
}

interface ChatComposerStateOptions {
  /** 助手模型（未配置时为 undefined），来自 useRightPanel。 */
  assistantModel: Ref<AIModel | undefined>;
  /** 是否正在发送 / 生成中。 */
  isSending: Ref<boolean>;
  /** 输入框双向绑定的文本。 */
  inputMessage: Ref<string>;
  /** 触发发送。 */
  sendMessage: () => void;
  /** 中断生成。 */
  stopGeneration: () => void;
  /** 发送按钮 CSS class 前缀，如 'cp-send' / 'tcp-send' / 'mc-send'。 */
  sendClassPrefix: string;
  /** 已配置模型时的输入框 placeholder。 */
  readyPlaceholder: string;
}

export function useChatComposerState(options: ChatComposerStateOptions) {
  const {
    assistantModel,
    isSending,
    inputMessage,
    sendMessage,
    stopGeneration,
    sendClassPrefix,
    readyPlaceholder,
  } = options;

  const assistantStatusText = computed(() =>
    assistantModel.value
      ? `${assistantModel.value.name || assistantModel.value.id} · 在线`
      : '未配置助手模型',
  );
  const inputPlaceholder = computed(() =>
    assistantModel.value ? readyPlaceholder : '未配置助手模型',
  );
  const inputDisabled = computed(() => isSending.value || !assistantModel.value);
  const sendClass = computed(() => ({
    [`${sendClassPrefix}--stop`]: isSending.value,
    [`${sendClassPrefix}--idle`]: !isSending.value && !inputMessage.value.trim(),
  }));
  const sendDisabled = computed(
    () => !isSending.value && (!inputMessage.value.trim() || !assistantModel.value),
  );
  const sendAriaLabel = computed(() => (isSending.value ? '停止' : '发送'));
  const sendIcon = computed(() => (isSending.value ? 'pi-stop-circle' : 'pi-send'));
  const onSendClick = () => {
    if (isSending.value) stopGeneration();
    else sendMessage();
  };

  // 发送按钮（ChatSendButton.vue）的全部 props 打包成单个对象，模板里 v-bind 一个对象，
  // 避免三变体逐字重复 button markup。baseClass 即各变体的发送按钮基类。
  const sendButton = computed<ChatSendButtonBindings>(() => ({
    baseClass: sendClassPrefix,
    sendClass: sendClass.value,
    disabled: sendDisabled.value,
    ariaLabel: sendAriaLabel.value,
    icon: sendIcon.value,
  }));

  return {
    assistantStatusText,
    inputPlaceholder,
    inputDisabled,
    sendClass,
    sendDisabled,
    sendAriaLabel,
    sendIcon,
    onSendClick,
    sendButton,
  };
}
