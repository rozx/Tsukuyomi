<script setup lang="ts">
/**
 * 聊天面板的发送 / 停止按钮。三个变体（Desktop / Tablet / Mobile）原本逐字内联
 * 同一段 `<button>` markup，抽成共享片段后各变体直接挂载它。
 *
 * 各变体的按钮基类不同（`cp-send` / `tcp-send` / `mc-send`），通过 `baseClass`
 * prop 传入；`<ChatSendButton>` 的根元素就是这个 `<button>`，因此父组件 scoped
 * 样式（`.cp-send` 等）会经由「子组件根节点继承父 scope」机制作用到它，渲染结果
 * 与原先逐字一致。
 *
 * Props 复用 `ChatSendButtonBindings`（与 useChatComposerState 共用同一份定义），
 * 字段只声明一处。
 */
import type { ChatSendButtonBindings } from 'src/composables/right-panel/useChatComposerState';

defineProps<ChatSendButtonBindings>();

defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    :class="[baseClass, sendClass]"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @click="$emit('click')"
  >
    <i class="pi" :class="icon" aria-hidden="true" />
  </button>
</template>

<style scoped>
/* 三个变体原本各有一条 `.X-send i { font-size: 13px }` 作用于按钮内图标。
   按钮 markup 抽到本组件后，内层 `<i>` 不再继承父 scope，故把这条同值规则收进
   本组件 scoped 样式（按钮外观——背景/hover/disabled/--idle/--stop——仍由父组件
   scoped 样式经「子组件根节点继承父 scope」作用到根 `<button>`，保持各变体差异）。 */
.pi {
  font-size: 13px;
}
</style>
