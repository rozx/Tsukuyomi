<script setup lang="ts">
/** 手机版面：与桌面同一顺序的单列，应用栏固定在底部。 */
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import RecipeHeader from './fragments/RecipeHeader.vue';
import SyncReadyBody from './fragments/SyncReadyBody.vue';
import ApplyBar from './fragments/ApplyBar.vue';
import HandoffNotice from './fragments/HandoffNotice.vue';
import CheckingState from './fragments/CheckingState.vue';

const { phase } = injectBookSync();
</script>

<template>
  <div v-if="phase !== 'idle'" class="bsw bsw--mobile">
    <RecipeHeader />
    <CheckingState v-if="phase === 'checking'" />
    <HandoffNotice v-else-if="phase !== 'ready'" />
    <template v-else>
      <SyncReadyBody />
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
