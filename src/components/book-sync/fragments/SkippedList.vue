<script setup lang="ts">
/** 已跳过的未导入章节：默认收起；之后的检查仍归入这里，可逐章取消跳过。 */
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { changeset, working, setSkipped } = injectBookSync();
const entries = computed(() => changeset.value?.skipped ?? []);
const expanded = ref(false);
</script>

<template>
  <section v-if="entries.length" class="sl">
    <Button
      class="sl-toggle"
      :label="`已跳过 ${entries.length} 章`"
      :icon="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
      size="small"
      text
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    />
    <ul v-if="expanded" class="bsw-list bsw-scroll">
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

<style scoped src="../book-sync.css"></style>
<style scoped>
.sl {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sl-toggle {
  align-self: flex-start;
}
</style>
