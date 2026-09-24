<script setup lang="ts">
/** 桌面版面：顶部来源与汇总，下方左列新章节、右列更新与跳过失败，底部应用栏。 */
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import RecipeHeader from './fragments/RecipeHeader.vue';
import ChangesetSummary from './fragments/ChangesetSummary.vue';
import NewChapterGroups from './fragments/NewChapterGroups.vue';
import DeepCheckBar from './fragments/DeepCheckBar.vue';
import UpdatedChapterList from './fragments/UpdatedChapterList.vue';
import SkippedList from './fragments/SkippedList.vue';
import FailedList from './fragments/FailedList.vue';
import ApplyBar from './fragments/ApplyBar.vue';
import HandoffNotice from './fragments/HandoffNotice.vue';
import CheckingState from './fragments/CheckingState.vue';

const { phase, target } = injectBookSync();
</script>

<template>
  <div v-if="phase !== 'idle'" class="bsw bsw--desktop">
    <div class="bsw-body">
      <RecipeHeader />
      <CheckingState v-if="phase === 'checking'" />
      <HandoffNotice v-else-if="phase !== 'ready'" />
      <template v-else>
        <ChangesetSummary />
        <FailedList />
        <div class="bsw-columns">
          <div class="bsw-column">
            <NewChapterGroups />
          </div>
          <div class="bsw-column">
            <template v-if="target && 'bookId' in target">
              <DeepCheckBar />
              <UpdatedChapterList />
            </template>
            <SkippedList />
          </div>
        </div>
      </template>
    </div>
    <ApplyBar v-if="phase === 'ready'" class="bsw-apply" />
  </div>
</template>

<style scoped>
.bsw {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  height: 100%;
}

.bsw-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 0.85rem;
  overflow-y: auto;
  scrollbar-width: thin;
}

.bsw-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.85rem;
  align-items: start;
}

.bsw-column {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}

.bsw-apply {
  flex-shrink: 0;
}

@media (max-width: 1100px) {
  .bsw-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
