<script setup lang="ts">
/** 手机版面：与桌面同一顺序的单列，应用栏固定在底部。 */
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import RecipeHeader from './fragments/RecipeHeader.vue';
import SyncVerdict from './fragments/SyncVerdict.vue';
import NewChapterGroups from './fragments/NewChapterGroups.vue';
import UpdatedChapterList from './fragments/UpdatedChapterList.vue';
import SkippedList from './fragments/SkippedList.vue';
import FailedList from './fragments/FailedList.vue';
import ApplyBar from './fragments/ApplyBar.vue';
import HandoffNotice from './fragments/HandoffNotice.vue';
import CheckingState from './fragments/CheckingState.vue';

const { phase, target } = injectBookSync();
</script>

<template>
  <div v-if="phase !== 'idle'" class="bsw bsw--mobile">
    <RecipeHeader />
    <CheckingState v-if="phase === 'checking'" />
    <HandoffNotice v-else-if="phase !== 'ready'" />
    <template v-else>
      <SyncVerdict />
      <FailedList />
      <NewChapterGroups />
      <UpdatedChapterList v-if="target && 'bookId' in target" />
      <SkippedList />
      <ApplyBar class="bsw-apply" />
    </template>
  </div>
</template>

<style scoped>
.bsw {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.5rem;
}

.bsw-apply {
  position: sticky;
  bottom: 0.5rem;
  z-index: 2;
}
</style>
