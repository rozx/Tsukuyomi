<script setup lang="ts">
/** 桌面：标题栏 + 网址输入 + 同步工作区。 */
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectBookSyncNew } from 'src/composables/book-sync-new/useBookSyncNew';
import SourceUrlForm from 'src/components/book-sync/fragments/SourceUrlForm.vue';
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';

const { goBack } = injectBookSyncNew();
const { t } = useI18n();
</script>

<template>
  <div class="bsn">
    <header class="bsn-header">
      <Button
        icon="pi pi-arrow-left"
        text
        rounded
        :aria-label="t('bookUi.sync.back')"
        @click="goBack"
      />
      <div>
        <h1 class="bsn-title">{{ t('bookUi.sync.importFromWeb') }}</h1>
        <p class="bsn-desc">{{ t('bookUi.sync.importFromWebDesc') }}</p>
      </div>
    </header>
    <SourceUrlForm class="bsn-form" />
    <div class="bsn-workspace">
      <BookSyncWorkspace />
    </div>
  </div>
</template>

<style scoped>
.bsn {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem 1rem;
}

.bsn-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.bsn-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.95);
}

.bsn-desc {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.55);
}

.bsn-workspace {
  flex: 1;
  min-height: 0;
}
</style>
