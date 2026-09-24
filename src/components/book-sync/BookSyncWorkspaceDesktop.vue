<script setup lang="ts">
/** 桌面版面：单列。来源 → 检查结论 → 失败 → 新章节 → 原文有修订 → 已跳过，底部应用栏。 */
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
  <div v-if="phase !== 'idle'" class="bsw bsw--desktop">
    <div class="bsw-body">
      <div class="bsw-column">
        <RecipeHeader />
        <CheckingState v-if="phase === 'checking'" />
        <HandoffNotice v-else-if="phase !== 'ready'" />
        <template v-else>
          <SyncVerdict />
          <FailedList />
          <NewChapterGroups />
          <UpdatedChapterList v-if="target && 'bookId' in target" />
          <SkippedList />
        </template>
      </div>
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.bsw-column {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: 100%;
  max-width: 64rem;
  min-width: 0;
  margin: 0 auto;
}

.bsw-apply {
  flex-shrink: 0;
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
}
</style>
