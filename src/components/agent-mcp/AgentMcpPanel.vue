<template>
  <component
    :is="flat ? 'section' : DesktopWorkbenchSurface"
    class="amcp-panel"
    :class="{ 'amcp-panel--flat': flat }"
    v-bind="flat ? {} : { tone: 'muted' }"
  >
    <header v-if="title || $slots.actions" class="amcp-panel-head">
      <div class="amcp-panel-copy">
        <h2 v-if="title" class="amcp-panel-title">{{ title }}</h2>
        <p v-if="hint" class="amcp-hint">{{ hint }}</p>
      </div>
      <div v-if="$slots.actions" class="amcp-panel-actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </component>
</template>

<script setup lang="ts">
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { useFlatAgentMcpPanels } from 'src/components/agent-mcp/panel-surface';

withDefaults(defineProps<{ title?: string; hint?: string }>(), { title: '', hint: '' });

// 桌面看板的栏位已有外框，这里不再套一层卡片
const flat = useFlatAgentMcpPanels();
</script>

<!-- 工作台各面板共用的小部件样式集中在这里，统一以 amcp- 前缀命名，避免在每个面板里重复定义 -->
<style>
.amcp-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* 放在页面提供的栏位里时没有自己的外框 */
.amcp-panel--flat {
  gap: 16px;
}

.amcp-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.amcp-panel-copy {
  min-width: 0;
}

.amcp-panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  /* Quasar 给 h2 设了很大的行高，这里必须显式覆盖 */
  line-height: 1.4;
  letter-spacing: normal;
  color: var(--moon-50-opacity-100);
}

.amcp-panel-actions {
  flex-shrink: 0;
}

.amcp-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-55);
}

.amcp-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--moon-50-opacity-78);
}

.amcp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.amcp-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.amcp-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

/* 可展开区域的标题按钮（工具分类、手动添加等） */
.amcp-disclosure {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-6);
  background: var(--white-opacity-2-5);
  color: var(--moon-50-opacity-92);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.amcp-disclosure:focus-visible {
  outline: 2px solid var(--tsukuyomi-opacity-40);
  outline-offset: 2px;
}

.amcp-disclosure .pi {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
}

/* 行右侧的控件组（状态标签 + 开关）保持原尺寸，不被文字挤出栏外 */
.amcp-row > .amcp-inline {
  flex-shrink: 0;
}

/* 状态标签不换行、不被挤压 */
.amcp-inline > .p-tag {
  flex-shrink: 0;
  white-space: nowrap;
}

/* 行内的按钮不随文字区域被挤压换行 */
.amcp-row > .p-button {
  flex-shrink: 0;
  white-space: nowrap;
}

.amcp-code {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-8);
  background: rgba(0, 0, 0, 0.3);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--tsukuyomi-200);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amcp-pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-8);
  background: rgba(0, 0, 0, 0.34);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--moon-50-opacity-92);
  overflow-x: auto;
  white-space: pre;
}

.amcp-pre--wrap {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 260px;
  overflow-y: auto;
}

.amcp-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
}

.amcp-alert--error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.amcp-alert--ok {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #bbf7d0;
}

.amcp-alert--warn {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fde68a;
}

.amcp-alert--info {
  background: var(--tsukuyomi-opacity-8);
  border: 1px solid var(--tsukuyomi-opacity-25);
  color: var(--tsukuyomi-200);
}

.amcp-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.amcp-confirm-title {
  font-size: 13px;
  font-weight: 600;
  color: #fecaca;
}

.amcp-confirm-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-78);
}

.amcp-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.amcp-divider {
  border: 0;
  border-top: 1px solid var(--white-opacity-6);
  margin: 0;
}

.amcp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.amcp-chip {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-8);
  background: var(--white-opacity-3);
  color: var(--moon-50-opacity-70);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.amcp-chip--active {
  background: var(--tsukuyomi-opacity-14);
  border-color: var(--tsukuyomi-opacity-40);
  color: var(--moon-50-opacity-100);
}

.amcp-chip:focus-visible {
  outline: 2px solid var(--tsukuyomi-opacity-40);
  outline-offset: 2px;
}
</style>
