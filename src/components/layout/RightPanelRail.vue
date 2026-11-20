<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

/**
 * 桌面右侧面板的折叠态纯图标竖排栏。从 AppRightPanelDesktop 拆出，
 * 让父模板只保留「折叠 rail / 展开面板」的二选一，降低模板圈复杂度。
 */
import { computed } from 'vue';
import BatchEmbeddingsButton from 'src/components/novel/BatchEmbeddingsButton.vue';
import { useBatchEmbeddingsPanel } from 'src/composables/useBatchEmbeddingsPanel';

interface Props {
  rightPanelOpen: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  expand: [];
}>();

const chatActive = computed(() => props.rightPanelOpen);

const { isAvailable: showBatchEmbeddings } = useBatchEmbeddingsPanel();
</script>

<template>
  <aside class="rp-rail rail-base-shell" :aria-label="i18nT('libraryUi.rightPanel')">
    <button
      type="button"
      class="rp-rail-item rail-base-btn"
      :class="{ active: chatActive }"
      :aria-label="i18nT('libraryUi.assistantLabel')"
      :title="i18nT('libraryUi.assistant')"
      @click="emit('expand')"
    >
      <i class="pi pi-comments" aria-hidden="true" />
    </button>

    <template v-if="showBatchEmbeddings">
      <div class="rp-rail-sep" />
      <BatchEmbeddingsButton class="rp-rail-item rail-base-btn" />
    </template>

    <div class="rp-rail-spacer" />
  </aside>
</template>

<style scoped>
/* 外壳 / 图标按钮的共享声明见 rail-base.css（与 TabletSideRail 共用） */
@import './rail-base.css';

/* 桌面右侧轨：占满父容器宽高，外壳基础样式来自 .rail-base-shell */
.rp-rail {
  width: 100%;
  height: 100%;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
}

/* 按钮基础样式来自 .rail-base-btn，这里仅补 padding 归零 */
.rp-rail-item {
  padding: 0;
}

.rp-rail-item i {
  font-size: 14px;
  line-height: 1;
}

.rp-rail-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e9edf5;
}

.rp-rail-item.active {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.32);
  color: #a3b7cf;
}

.rp-rail-sep {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

.rp-rail-spacer {
  flex: 1;
}
</style>
