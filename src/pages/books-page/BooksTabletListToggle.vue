<script setup lang="ts">
/**
 * 平板书库的书籍列表开关，渲染在顶部信息条最左侧（见 TabletSysbarToggle）。
 * 竖屏列表是叠层，横屏列表参与布局，开关状态都在 useBooksTabletPage。
 */
import { useI18n } from 'vue-i18n';
import TabletSysbarToggle from 'src/components/layout/TabletSysbarToggle.vue';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';

const { t } = useI18n();
const page = injectBooksTabletPage();
</script>

<template>
  <TabletSysbarToggle
    :open="page.isListOpen.value"
    :collapse-label="t('libraryUi.collapseBooks')"
    :expand-label="t('libraryUi.expandBooks')"
    @toggle="page.toggleList"
  />
</template>
