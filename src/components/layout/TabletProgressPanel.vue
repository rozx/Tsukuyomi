<script setup lang="ts">
/**
 * 平板翻译进度面板——参考 MobileProgressSheet 的布局（appbar icon + 标题 +
 * 副标题 + close），但外壳从 MobileBottomSheet 改成右侧侧滑面板。与
 * TabletChatPanel 互斥挂载（由 MainLayoutTablet 按 activeRightTab 驱动）。
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
  <aside class="tpp-shell" aria-label="翻译进度">
    <header class="tpp-appbar">
      <div class="tpp-appbar-icon"><i class="pi pi-bolt" aria-hidden="true" /></div>
      <div class="tpp-appbar-text">
        <div class="tpp-appbar-title">翻译进度</div>
        <div class="tpp-appbar-sub">
          <template v-if="currentTask && mobileCurrentChapterLabel">
            {{ mobileCurrentChapterLabel }} · {{ mobileWorkflowLabel }}
          </template>
          <template v-else-if="currentTask">{{ mobileWorkflowLabel }}</template>
          <template v-else>暂无翻译任务</template>
        </div>
      </div>
      <button type="button" class="tpp-close" aria-label="关闭" @click="close">
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </header>

    <div class="tpp-body">
      <TranslationProgress />
    </div>
  </aside>
</template>

<style scoped>
.tpp-shell {
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

.tpp-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.tpp-appbar-icon {
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

.tpp-appbar-icon i {
  font-size: 13px;
}

.tpp-appbar-text {
  flex: 1;
  min-width: 0;
}

.tpp-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  line-height: 1.2;
}

.tpp-appbar-sub {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tpp-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(192, 198, 209, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tpp-close i {
  font-size: 11px;
}

.tpp-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e9edf5;
}

.tpp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tpp-body > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
