<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

/**
 * 平板书库右侧竖向 rail（列表 dock 切换 + 月詠 + 翻译进度）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import TabletSideRail from 'src/components/layout/TabletSideRail.vue';
import NotificationBadge from 'src/components/layout/NotificationBadge.vue';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';

const t = injectBooksTabletPage();

const listButtonTitle = computed(() =>
  t.isListOpen.value ? i18nT('libraryUi.collapseBooks') : i18nT('libraryUi.expandBooks'),
);
const sidebarIcon = computed(() => (t.isListOpen.value ? 'pi-angle-double-left' : 'pi-bars'));
const hasActiveTask = computed(() => t.activeTranslationTaskCount.value > 0);
</script>

<template>
  <!-- 右侧 rail —— list 切换 + AI 助手 + 翻译进度。竖屏 list 是 overlay，
       toggle 按钮留在 rail 上；横屏 list 参与 flex 布局，toggle 把它收掉腾空间。 -->
  <TabletSideRail>
    <button
      type="button"
      class="tsr-btn rail-base-btn"
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
      class="tsr-btn rail-base-btn"
      :class="{ 'tsr-btn--active': t.isChatActive.value }"
      :title="i18nT('libraryUi.assistant')"
      @click="() => t.toggleRail('chat')"
    >
      <i class="pi pi-sparkles" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="tsr-btn rail-base-btn"
      :class="{ 'tsr-btn--active': t.isProgressActive.value }"
      :title="i18nT('libraryUi.progress')"
      @click="() => t.toggleRail('progress')"
    >
      <i class="pi pi-objects-column" aria-hidden="true" />
      <NotificationBadge v-if="hasActiveTask">
        {{ t.activeTranslationTaskCount.value }}
      </NotificationBadge>
    </button>
  </TabletSideRail>
</template>

<style scoped>
/* 侧轨按钮基础样式与 RightPanelRail 共用，见 rail-base.css */
@import 'src/components/layout/rail-base.css';
</style>
