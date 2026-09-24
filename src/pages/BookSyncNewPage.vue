<script setup lang="ts">
/**
 * /books/new/web 的 dispatcher：从网站新建书籍。
 * provideBookSyncNew() 在这里只执行一次（含同步会话），设备变体只负责版面。
 */
import { computed } from 'vue';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { provideBookSyncNew } from 'src/composables/book-sync-new/useBookSyncNew';
import BookSyncNewDesktop from './book-sync-new/BookSyncNewDesktop.vue';
import BookSyncNewTablet from './book-sync-new/BookSyncNewTablet.vue';
import BookSyncNewMobile from './book-sync-new/BookSyncNewMobile.vue';

provideBookSyncNew();
const { variant } = useDeviceVariant();

const variantComponent = computed(() => {
  switch (variant.value) {
    case 'mobile':
      return BookSyncNewMobile;
    case 'tablet':
      return BookSyncNewTablet;
    case 'desktop':
    default:
      return BookSyncNewDesktop;
  }
});
</script>

<template>
  <component :is="variantComponent" />
</template>
