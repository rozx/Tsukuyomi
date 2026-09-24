<script setup lang="ts">
/** 已跳过的未导入章节：之后的检查仍归入这里，可逐章取消跳过。 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { changeset, working, setSkipped } = injectBookSync();
const entries = computed(() => changeset.value?.skipped ?? []);
</script>

<template>
  <section v-if="entries.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-eye-slash" aria-hidden="true" />已跳过
        <span class="ipl-count">{{ entries.length }}</span>
      </h3>
    </div>
    <ul class="bsw-list bsw-scroll">
      <li v-for="entry in entries" :key="entry.url" class="bsw-row">
        <span class="bsw-title" :title="entry.title">{{ entry.title }}</span>
        <Button
          label="取消跳过"
          :aria-label="`取消跳过${entry.title}`"
          size="small"
          text
          :disabled="working"
          @click="setSkipped([{ url: entry.url, title: entry.title }], false)"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped src="../book-sync.css"></style>
