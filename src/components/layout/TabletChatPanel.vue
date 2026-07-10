<script setup lang="ts">
/**
 * 平板 AI 助手面板——参考 MobileChatSheet 的单行 appbar（logo + 标题 +
 * 在线状态副标题 + 动作按钮 + close）+ 胶囊输入栏。外壳从 MobileBottomSheet
 * 改成右侧侧滑面板，与 TabletProgressPanel 互斥挂载（由 MainLayoutTablet
 * 按 activeRightTab 驱动）。
 *
 * 内部状态完全来自 useRightPanel，与 AppRightPanelDesktop 共享 composable；
 * 这里只换一层 chrome、不 duplicate 任何消息/输入逻辑。
 */
import ChatActionPopovers from 'src/components/layout/ChatActionPopovers.vue';
import ChatSendButton from 'src/components/layout/ChatSendButton.vue';
import ChatSessionListPopover from 'src/components/layout/ChatSessionListPopover.vue';
import ChatMessageList from 'src/components/layout/ChatMessageList.vue';
import AssistantAvatar from 'src/components/layout/AssistantAvatar.vue';
import { useUiStore } from 'src/stores/ui';
import { useChatPanelSetup } from 'src/composables/right-panel/useChatPanelSetup';
import { useChatPanelBindings } from 'src/composables/right-panel/useChatPanelBindings';

const ui = useUiStore();

// useRightPanel 解构 + bindXxxRef 样板已抽到 useChatPanelSetup，Mobile 变体也走同一份 helper。
// 保留整个 panel 对象传给 useChatPanelBindings，避免逐字段重复实参；模板用到的字段才解构。
const panel = useChatPanelSetup();
const {
  chatSessionsStore,
  panelContainerRef,
  messagesContainerRef,
  inputMessage,
  assistantModel,
  sendMessage,
  recentSessions,
  switchToSession,
  toggleSessionListPopover,
  hideSessionListPopover,
  createNewSession,
  bindSessionListRef,
} = panel;

const close = () => ui.closeRightPanel();

// 发送状态 / 浮层绑定 / 消息列表绑定一次性产出（与 Desktop / Mobile 同构，差异仅前缀与 placeholder）。
const { composer, actionPopoverBindings, messageListBindings } = useChatPanelBindings(panel, {
  sendClassPrefix: 'tcp-send',
  readyPlaceholder: '请月詠相助…',
});
const { assistantStatusText, inputPlaceholder, inputDisabled, sendButton, onSendClick } = composer;
</script>

<template>
  <aside ref="panelContainerRef" class="tcp-shell" aria-label="月詠 AI 助手">
    <header class="tcp-appbar">
      <AssistantAvatar :size="28" class="tcp-appbar-avatar" />
      <div class="tcp-appbar-text">
        <div class="tcp-appbar-title">月詠</div>
        <div class="tcp-appbar-sub">
          <span
            class="tcp-status-dot"
            :class="{ 'tcp-status-dot--off': !assistantModel }"
          />
          {{ assistantStatusText }}
        </div>
      </div>
      <button
        v-if="chatSessionsStore.allSessions.length > 1"
        id="session-list-button-tablet"
        type="button"
        class="tcp-icon-btn"
        aria-label="会话历史"
        @click="toggleSessionListPopover"
      >
        <i class="pi pi-history" aria-hidden="true" />
      </button>
      <button type="button" class="tcp-icon-btn" aria-label="新聊天" @click="createNewSession">
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tcp-icon-btn tcp-icon-btn--close"
        aria-label="关闭"
        @click="close"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <ChatSessionListPopover
      :ref="bindSessionListRef"
      target="#session-list-button-tablet"
      :sessions="recentSessions"
      :current-session-id="chatSessionsStore.currentSessionId"
      @hide="hideSessionListPopover"
      @select="switchToSession"
    />

    <div
      ref="messagesContainerRef"
      class="tcp-messages"
    >
      <ChatMessageList v-bind="messageListBindings" />
    </div>

    <div class="tcp-composer-wrap">
      <div class="tcp-composer">
        <button class="tcp-plus" aria-label="更多操作">
          <i class="pi pi-plus" aria-hidden="true" />
        </button>
        <input
          v-model="inputMessage"
          :disabled="inputDisabled"
          :placeholder="inputPlaceholder"
          class="tcp-input"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <ChatSendButton v-bind="sendButton" @click="onSendClick" />
      </div>
    </div>

    <ChatActionPopovers :bindings="actionPopoverBindings" />
  </aside>
</template>

<style scoped>
.tcp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(14, 16, 20, 0.96);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
}

.tcp-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.tcp-messages {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 16px 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  display: flex;
  flex-direction: column;
}

.tcp-messages :deep(.h-full) {
  flex: 1;
  min-height: 100%;
}

.tcp-messages::-webkit-scrollbar {
  width: 6px;
}

.tcp-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

/* 胶囊输入栏容器 padding 与手机不同（无 iOS 安全区） */
.tcp-composer-wrap {
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.72);
  flex-shrink: 0;
}
</style>

<!-- 两端逐字相同的规则（appbar 内元素 / 图标按钮 / 胶囊输入栏内元素）见 chat-panel.css -->
<style scoped src="./chat-panel.css"></style>
