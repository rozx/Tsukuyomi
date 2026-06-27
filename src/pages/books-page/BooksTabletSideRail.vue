<script setup lang="ts">
/**
 * 平板书库右侧竖向 rail（列表 dock 切换 + 月詠 + 翻译进度）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import TabletSideRail from 'src/components/layout/TabletSideRail.vue';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';

const t = injectBooksTabletPage();

const listButtonTitle = computed(() => (t.isListOpen.value ? '收起书籍列表' : '展开书籍列表'));
const sidebarIcon = computed(() => (t.isListOpen.value ? 'pi-angle-double-left' : 'pi-bars'));
const hasActiveTask = computed(() => t.activeTranslationTaskCount.value > 0);
</script>

<template>
  <!-- 右侧 rail —— list 切换 + AI 助手 + 翻译进度。竖屏 list 是 overlay，
       toggle 按钮留在 rail 上；横屏 list 参与 flex 布局，toggle 把它收掉腾空间。 -->
  <TabletSideRail>
    <button
      type="button"
      class="tsr-btn"
      :class="{ 'tsr-btn--active': t.isListOpen.value }"
      :title="listButtonTitle"
      :aria-label="listButtonTitle"
      :aria-pressed="t.isListOpen.value"
      @click="t.toggleList"
    >
      <i class="pi" :class="sidebarIcon" aria-hidden="true" />
    </button>

    <div class="tsr-sep" />

    <button
      type="button"
      class="tsr-btn"
      :class="{ 'tsr-btn--active': t.isChatActive.value }"
      title="月詠"
      @click="() => t.toggleRail('chat')"
    >
      <i class="pi pi-sparkles" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="tsr-btn"
      :class="{ 'tsr-btn--active': t.isProgressActive.value }"
      title="翻译进度"
      @click="() => t.toggleRail('progress')"
    >
      <i class="pi pi-objects-column" aria-hidden="true" />
      <span v-if="hasActiveTask" class="tsr-badge">
        {{ t.activeTranslationTaskCount.value }}
      </span>
    </button>
  </TabletSideRail>
</template>
