<script setup lang="ts">
/** 手机：全屏页面，顶栏返回，下方网址输入与单列工作区。 */
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectBookSyncNew } from 'src/composables/book-sync-new/useBookSyncNew';
import SourceUrlForm from 'src/components/book-sync/fragments/SourceUrlForm.vue';
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';

const { goBack } = injectBookSyncNew();
const { t } = useI18n();
</script>

<template>
  <div class="bsn-m">
    <header class="bsn-m-bar">
      <Button
        icon="pi pi-arrow-left"
        text
        rounded
        :aria-label="t('bookUi.sync.back')"
        @click="goBack"
      />
      <h1 class="bsn-m-title">{{ t('bookUi.sync.importFromWeb') }}</h1>
    </header>
    <div class="bsn-m-body">
      <SourceUrlForm />
      <BookSyncWorkspace />
    </div>
  </div>
</template>

<style scoped>
.bsn-m {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

.bsn-m-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.bsn-m-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.95);
}

.bsn-m-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  overflow: visible;
}
</style>
