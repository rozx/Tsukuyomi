<script setup lang="ts">
/**
 * 桌面翻译进度面板 —— 与 TabletProgressPanel 同构，桌面侧栏展开时由
 * AppRightPanelDesktop 挂载。关闭按钮直接折叠成图标栏。
 */
import TranslationProgress from 'src/components/novel/TranslationProgress.vue';
import { useUiStore } from 'src/stores/ui';
import { useTranslationProgressPanel } from 'src/composables/translation-progress/useTranslationProgressPanel';

const ui = useUiStore();
const { currentTask, mobileCurrentChapterLabel, mobileWorkflowLabel } =
  useTranslationProgressPanel();

const close = () => ui.closeRightPanel();
</script>

<template>
  <section class="pp-shell" aria-label="翻译进度">
    <header class="pp-appbar">
      <div class="pp-appbar-icon"><i class="pi pi-bolt" aria-hidden="true" /></div>
      <div class="pp-appbar-text">
        <div class="pp-appbar-title">翻译进度</div>
        <div class="pp-appbar-sub">
          <template v-if="currentTask && mobileCurrentChapterLabel">
            {{ mobileCurrentChapterLabel }} · {{ mobileWorkflowLabel }}
          </template>
          <template v-else-if="currentTask">{{ mobileWorkflowLabel }}</template>
          <template v-else>暂无翻译任务</template>
        </div>
      </div>
      <button
        type="button"
        class="pp-icon-btn pp-icon-btn--close"
        aria-label="关闭"
        @click="close"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <div class="pp-body">
      <TranslationProgress />
    </div>
  </section>
</template>

<style scoped>
.pp-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pp-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.pp-appbar-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(109, 136, 168, 0.15);
  border: 1px solid rgba(109, 136, 168, 0.3);
  color: #a3b7cf;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pp-appbar-icon i {
  font-size: 13px;
}

.pp-appbar-text {
  flex: 1;
  min-width: 0;
}

.pp-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-opacity-100);
  line-height: 1.2;
}

.pp-appbar-sub {
  font-size: 10px;
  color: var(--moon-opacity-50);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pp-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--moon-opacity-70);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.pp-icon-btn--close {
  border-radius: 50%;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-4);
  color: rgba(192, 198, 209, 0.85);
}

.pp-icon-btn--close i {
  font-size: 11px;
}

.pp-icon-btn--close:hover,
.pp-icon-btn--close:active {
  background: var(--white-opacity-8);
  color: #e9edf5;
}

.pp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pp-body > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
