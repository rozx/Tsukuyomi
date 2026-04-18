<script setup lang="ts">
/**
 * 手机端翻译进度底部抽屉。与 MobileChatSheet 独立挂载；
 * header 走 MobileBottomSheet 的 #header slot 单行紧凑布局（icon + 标题 +
 * 副标题 + X），不再用默认的 eyebrow + 大标题。
 */
import { computed } from 'vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import TranslationProgress from 'src/components/novel/TranslationProgress.vue';
import { useTranslationProgressPanel } from 'src/composables/translation-progress/useTranslationProgressPanel';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

// header 副标题：当前任务的章节 + workflow；空闲时显示"暂无翻译任务"
const { currentTask, mobileCurrentChapterLabel, mobileWorkflowLabel } =
  useTranslationProgressPanel();
</script>

<template>
  <MobileBottomSheet v-model:visible="localVisible" title="翻译进度" full-bleed>
    <template #header="{ close }">
      <header class="mps-appbar">
        <div class="mps-appbar-icon"><i class="pi pi-bolt" aria-hidden="true" /></div>
        <div class="mps-appbar-text">
          <div class="mps-appbar-title">翻译进度</div>
          <div class="mps-appbar-sub">
            <template v-if="currentTask && mobileCurrentChapterLabel">
              {{ mobileCurrentChapterLabel }} · {{ mobileWorkflowLabel }}
            </template>
            <template v-else-if="currentTask">{{ mobileWorkflowLabel }}</template>
            <template v-else>暂无翻译任务</template>
          </div>
        </div>
        <button type="button" class="mps-close" aria-label="关闭" @click="close">
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </header>
    </template>

    <div class="mps-shell">
      <TranslationProgress />
    </div>
  </MobileBottomSheet>
</template>

<style scoped>
.mps-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.mps-shell > :deep(*) {
  flex: 1;
  min-height: 0;
}

.mps-appbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  width: 100%;
}

.mps-appbar-icon {
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

.mps-appbar-icon i {
  font-size: 13px;
}

.mps-appbar-text {
  flex: 1;
  min-width: 0;
}

.mps-appbar-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  line-height: 1.2;
}

.mps-appbar-sub {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mps-close {
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

.mps-close i {
  font-size: 11px;
}

.mps-close:active {
  background: rgba(255, 255, 255, 0.08);
  color: #e9edf5;
}
</style>
