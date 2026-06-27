<script setup lang="ts">
/**
 * 桌面右侧面板的折叠态纯图标竖排栏。从 AppRightPanelDesktop 拆出，
 * 让父模板只保留「折叠 rail / 展开面板」的二选一，降低模板圈复杂度。
 */
import { computed, ref } from 'vue';
import BatchEmbeddingsPanel from 'src/components/novel/BatchEmbeddingsPanel.vue';
import NotificationBadge from 'src/components/layout/NotificationBadge.vue';

interface Props {
  activeRightTab: 'chat' | 'progress';
  rightPanelOpen: boolean;
  activeTranslationTaskCount: number;
  showBatchEmbeddings: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  expand: [tab: 'chat' | 'progress'];
}>();

const chatActive = computed(() => props.activeRightTab === 'chat' && props.rightPanelOpen);
const progressActive = computed(() => props.activeRightTab === 'progress' && props.rightPanelOpen);
const progressBadge = computed(() =>
  props.activeTranslationTaskCount > 99 ? '99+' : props.activeTranslationTaskCount,
);

const batchEmbeddingsPanelRef = ref<{ toggle: () => void } | null>(null);
const toggleBatchEmbeddingsPanel = () => {
  batchEmbeddingsPanelRef.value?.toggle();
};
</script>

<template>
  <aside class="rp-rail rail-base-shell" aria-label="右侧面板">
    <button
      type="button"
      class="rp-rail-item rail-base-btn"
      :class="{ active: chatActive }"
      aria-label="月詠 AI 助手"
      title="月詠"
      @click="emit('expand', 'chat')"
    >
      <i class="pi pi-comments" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="rp-rail-item rail-base-btn"
      :class="{ active: progressActive }"
      aria-label="翻译进度"
      title="翻译进度"
      @click="emit('expand', 'progress')"
    >
      <i class="pi pi-list-check" aria-hidden="true" />
      <NotificationBadge v-if="activeTranslationTaskCount > 0">
        {{ progressBadge }}
      </NotificationBadge>
    </button>

    <template v-if="showBatchEmbeddings">
      <div class="rp-rail-sep" />
      <button
        type="button"
        class="rp-rail-item rail-base-btn"
        aria-label="向量索引"
        title="向量索引"
        @click="toggleBatchEmbeddingsPanel"
      >
        <i class="pi pi-bolt" aria-hidden="true" />
      </button>
    </template>

    <div class="rp-rail-spacer" />

    <!-- 仅在书籍详情路由下挂载：避免在无关页面上订阅 EmbeddingQueue/Service/Memory 事件并触发 DB 查询 -->
    <BatchEmbeddingsPanel v-if="showBatchEmbeddings" ref="batchEmbeddingsPanelRef" />
  </aside>
</template>

<style scoped>
/* 外壳 / 图标按钮的共享声明见 rail-base.css（与 TabletSideRail 共用） */
@import './rail-base.css';

/* 桌面右侧轨：占满父容器宽高，外壳基础样式来自 .rail-base-shell */
.rp-rail {
  width: 100%;
  height: 100%;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
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
